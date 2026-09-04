#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import tempfile
import threading
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

DATA_FILE = Path(os.getenv("PORTFOLIO_STATE_FILE", "/var/lib/portfolio-news-dashboard/holdings.json"))
USAGE_FILE = Path(os.getenv("XAI_USAGE_FILE", "/var/lib/portfolio-news-dashboard/xai-usage.json"))
MAX_BODY = 256 * 1024
MAX_CHAT_MESSAGES = 20
MAX_CHAT_CHARS = 24_000
MAX_DAILY_CHAT_REQUESTS = int(os.getenv("XAI_DAILY_REQUEST_LIMIT", "40"))
XAI_URL = "https://api.x.ai/v1/responses"
XAI_MODEL = os.getenv("XAI_MODEL", "grok-4.3")
_usage_lock = threading.Lock()
MARKETS = {"美股", "A股", "港股", "加密", "其他"}
DIRECTIONS = {"多", "空", "空2x"}

XAI_INSTRUCTIONS = """你是嵌入个人投资工作台的中文研究助手。回答必须简洁、直接并适合职业投资者阅读。
需要了解X上的实时帖子、账号观点或讨论时使用x_search，并优先引用原帖。明确区分已确认事实、帖子作者观点和你的分析；X帖子不能自动升级为公司、监管或宏观事实。涉及财务、监管、政策或事件日期时，提示需要一级来源确认。不得编造帖子、作者、数字、日期、链接或市场共识。"""


def validate_holdings(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list) or len(value) > 200:
        raise ValueError("holdings must be an array with at most 200 items")
    result = []
    allowed = {"id", "ticker", "name", "market", "direction", "weight", "thesis", "invalidation", "target", "stop"}
    for item in value:
        if not isinstance(item, dict) or set(item) - allowed:
            raise ValueError("holding contains unsupported fields")
        required = ("id", "ticker", "name", "market", "direction", "weight", "thesis", "invalidation")
        if any(key not in item for key in required):
            raise ValueError("holding is missing required fields")
        if item["market"] not in MARKETS or item["direction"] not in DIRECTIONS:
            raise ValueError("holding contains an unsupported enum value")
        if not isinstance(item["weight"], (int, float)) or isinstance(item["weight"], bool) or not 0 <= item["weight"] <= 100:
            raise ValueError("holding weight must be between 0 and 100")
        cleaned = {key: item[key] for key in required}
        for key in ("id", "ticker", "name", "thesis", "invalidation"):
            if not isinstance(cleaned[key], str) or len(cleaned[key]) > 4000:
                raise ValueError(f"invalid holding field: {key}")
        for key in ("target", "stop"):
            if key in item and item[key] is not None:
                if not isinstance(item[key], str) or len(item[key]) > 1000:
                    raise ValueError(f"invalid holding field: {key}")
                cleaned[key] = item[key]
        result.append(cleaned)
    return result


def read_state() -> tuple[bool, list[dict[str, Any]]]:
    if not DATA_FILE.exists():
        return False, []
    return True, validate_holdings(json.loads(DATA_FILE.read_text(encoding="utf-8")))


def write_state(holdings: list[dict[str, Any]]) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix="holdings-", suffix=".tmp", dir=DATA_FILE.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(holdings, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, DATA_FILE)
        os.chmod(DATA_FILE, 0o600)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def validate_chat_messages(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list) or not 1 <= len(value) <= MAX_CHAT_MESSAGES:
        raise ValueError("messages must be a non-empty bounded array")
    result: list[dict[str, str]] = []
    total = 0
    for item in value:
        if not isinstance(item, dict) or set(item) != {"role", "content"}:
            raise ValueError("invalid message shape")
        role, content = item.get("role"), item.get("content")
        if role not in {"user", "assistant"} or not isinstance(content, str):
            raise ValueError("invalid message")
        content = content.strip()
        if not content or len(content) > 8_000:
            raise ValueError("invalid message content")
        total += len(content)
        result.append({"role": role, "content": content})
    if result[-1]["role"] != "user" or total > MAX_CHAT_CHARS:
        raise ValueError("invalid conversation")
    return result


def _consume_chat_quota(now: datetime | None = None, amount: int = 1) -> int:
    if amount < 1 or amount > 3:
        raise ValueError("invalid quota amount")
    today = (now or datetime.now(timezone.utc)).date().isoformat()
    with _usage_lock:
        usage = {"date": today, "count": 0}
        if USAGE_FILE.exists():
            try:
                loaded = json.loads(USAGE_FILE.read_text(encoding="utf-8"))
                if loaded.get("date") == today and isinstance(loaded.get("count"), int):
                    usage = loaded
            except (OSError, ValueError, TypeError):
                pass
        if usage["count"] + amount > MAX_DAILY_CHAT_REQUESTS:
            raise RuntimeError("daily_limit")
        usage["count"] += amount
        USAGE_FILE.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(prefix="xai-usage-", suffix=".tmp", dir=USAGE_FILE.parent)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                json.dump(usage, handle)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, USAGE_FILE)
            os.chmod(USAGE_FILE, 0o600)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        return MAX_DAILY_CHAT_REQUESTS - usage["count"]


def _extract_xai_response(payload: dict[str, Any]) -> tuple[str, list[str], dict[str, int]]:
    text_parts: list[str] = []
    citations: list[str] = []
    for output in payload.get("output", []):
        if not isinstance(output, dict) or output.get("type") != "message":
            continue
        for content in output.get("content", []):
            if not isinstance(content, dict) or content.get("type") != "output_text":
                continue
            if isinstance(content.get("text"), str):
                text_parts.append(content["text"].strip())
            for annotation in content.get("annotations", []):
                if isinstance(annotation, dict) and isinstance(annotation.get("url"), str):
                    citations.append(annotation["url"])
    for citation in payload.get("citations", []):
        if isinstance(citation, str):
            citations.append(citation)
        elif isinstance(citation, dict) and isinstance(citation.get("url"), str):
            citations.append(citation["url"])
    text = "\n\n".join(part for part in text_parts if part)
    if not text:
        raise RuntimeError("empty_response")
    usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
    normalized_usage = {
        "input_tokens": int(usage.get("input_tokens") or 0),
        "output_tokens": int(usage.get("output_tokens") or 0),
    }
    return text, list(dict.fromkeys(citations))[:12], normalized_usage


def _call_xai(messages: list[dict[str, str]], tool: dict[str, Any]) -> tuple[str, list[str], dict[str, int]]:
    api_key = os.getenv("XAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("not_configured")
    request = urllib.request.Request(
        XAI_URL,
        data=json.dumps({
            "model": XAI_MODEL,
            "instructions": XAI_INSTRUCTIONS,
            "input": messages,
            "tools": [tool],
            "max_output_tokens": 1200,
            "reasoning": {"effort": "low"},
        }).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        payload = json.loads(response.read())
    if not isinstance(payload, dict):
        raise RuntimeError("invalid_response")
    return _extract_xai_response(payload)


def call_xai(messages: list[dict[str, str]]) -> tuple[str, list[str], dict[str, int]]:
    return _call_xai(messages, {"type": "x_search"})


def validate_x_handles(value: Any) -> list[str]:
    if not isinstance(value, list) or not 1 <= len(value) <= 50:
        raise ValueError("invalid handles")
    result: list[str] = []
    for handle in value:
        if not isinstance(handle, str):
            raise ValueError("invalid handle")
        normalized = handle.strip().lstrip("@").lower()
        if not normalized or len(normalized) > 15 or not all(character.isalnum() or character == "_" for character in normalized):
            raise ValueError("invalid handle")
        if normalized not in result:
            result.append(normalized)
    return result


def build_x_digest(handles: list[str], now: datetime | None = None) -> dict[str, Any]:
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    window_start = current - timedelta(hours=30)
    batches = [handles[index:index + 20] for index in range(0, len(handles), 20)]
    remaining = _consume_chat_quota(current, len(batches))
    summaries = []
    for batch in batches:
        prompt = f"""扫描指定X账号在严格时间窗口内发布的原创帖子和有实质内容的转帖。
窗口开始：{window_start.isoformat()}
窗口结束：{current.isoformat()}
账号：{', '.join('@' + handle for handle in batch)}

只保留足以改变持仓、宏观、利率、流动性、加密、行业供需、盈利或风险判断的增量信息，最多5条，按重要性排序。普通行情感想、无依据喊单、广告、重复内容和窗口外帖子全部省略。每条写明账号、原帖时间、已表达的事实或作者观点，以及具体投资含义；不得把帖子观点写成已确认事实。若没有达到门槛的内容，只回答“本组账号过去30小时无重大新增”。使用简洁中文，不写方法说明。"""
        answer, citations, usage = _call_xai(
            [{"role": "user", "content": prompt}],
            {
                "type": "x_search",
                "allowed_x_handles": batch,
                "from_date": window_start.date().isoformat(),
                "to_date": current.date().isoformat(),
            },
        )
        summaries.append({"handles": batch, "summary": answer, "citations": citations, "usage": usage})
    return {
        "generated_at": current.isoformat(),
        "window_start": window_start.isoformat(),
        "summaries": summaries,
        "remaining_today": remaining,
    }


class Handler(BaseHTTPRequestHandler):
    def _json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path != "/holdings":
            self._json(404, {"error": "not_found"}); return
        try:
            initialized, holdings = read_state()
            self._json(200, {"initialized": initialized, "holdings": holdings})
        except Exception:
            self._json(500, {"error": "state_unavailable"})

    def do_POST(self) -> None:
        if self.path not in {"/chat", "/x-digest"}:
            self._json(404, {"error": "not_found"}); return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY:
                raise ValueError("invalid request size")
            payload = json.loads(self.rfile.read(length))
            if self.path == "/x-digest":
                handles = validate_x_handles(payload.get("handles") if isinstance(payload, dict) else None)
                self._json(200, build_x_digest(handles))
                return
            messages = validate_chat_messages(payload.get("messages") if isinstance(payload, dict) else None)
            remaining = _consume_chat_quota()
            answer, citations, usage = call_xai(messages)
            self._json(200, {"answer": answer, "citations": citations, "usage": usage, "remaining_today": remaining})
        except (ValueError, json.JSONDecodeError):
            self._json(400, {"error": "invalid_chat"})
        except RuntimeError as exc:
            error = str(exc)
            if error == "daily_limit":
                self._json(429, {"error": "daily_limit"})
            elif error == "not_configured":
                self._json(503, {"error": "chat_unavailable"})
            else:
                self._json(502, {"error": "upstream_unavailable"})
        except (urllib.error.URLError, TimeoutError, OSError):
            self._json(502, {"error": "upstream_unavailable"})
        except Exception:
            self._json(500, {"error": "chat_unavailable"})

    def do_PUT(self) -> None:
        if self.path != "/holdings":
            self._json(404, {"error": "not_found"}); return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY:
                raise ValueError("invalid request size")
            payload = json.loads(self.rfile.read(length))
            holdings = validate_holdings(payload.get("holdings") if isinstance(payload, dict) else None)
            write_state(holdings)
            self._json(200, {"saved": True, "count": len(holdings)})
        except (ValueError, json.JSONDecodeError):
            self._json(400, {"error": "invalid_holdings"})
        except Exception:
            self._json(500, {"error": "state_unavailable"})

    def log_message(self, format: str, *args: Any) -> None:
        return


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8791), Handler).serve_forever()
