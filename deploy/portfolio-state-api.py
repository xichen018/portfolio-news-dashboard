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
DIGEST_FILE = Path(os.getenv("XAI_DIGEST_FILE", "/var/lib/portfolio-news-dashboard/x-digest.json"))
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


def read_x_digest() -> tuple[bool, dict[str, Any]]:
    if not DIGEST_FILE.exists():
        return False, {}
    payload = json.loads(DIGEST_FILE.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or not isinstance(payload.get("generated_at"), str) or not isinstance(payload.get("summaries"), list):
        raise ValueError("invalid digest state")
    return True, payload


def write_x_digest(payload: dict[str, Any]) -> None:
    DIGEST_FILE.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix="x-digest-", suffix=".tmp", dir=DIGEST_FILE.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, DIGEST_FILE)
        os.chmod(DIGEST_FILE, 0o600)
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
        prompt = f"""扫描指定X账号在严格时间窗口内发布的原创帖子和有实质内容的转帖，为职业投资者制作高信噪比摘要。
窗口开始：{window_start.isoformat()}
窗口结束：{current.isoformat()}
账号：{', '.join('@' + handle for handle in batch)}

入选必须同时满足：
1. 帖子确实发布于上述30小时窗口；
2. 包含该作者提供的原创增量信息或差异化分析，而不是转述公开数据、新闻或价格走势；
3. 至少具备一项决策价值：公司/项目/政策的一手信息、明确且临近的催化剂、供需/盈利/资金流变化，或有具体证据且足以改变情景概率的观点；
4. 能说清受影响资产及传导路径。

直接剔除：经济数据或新闻标题的简单转发、泛泛宏观评论、单纯看多看空、目标价喊单、盘面复述、情绪表达、广告推广、抽奖、旧闻、重复转发、无新增信息的引用、无法确认发布时间的帖子，以及只有相关性但没有投资含义的内容。作者知名度不能代替信息价值。官方数据应由一级来源提供，账号仅转发数据时不入选。

最多保留3条，按对仓位决策的重要性排序。每条固定写成：
“账号｜香港时间
值得关注：作者提供的原创增量信息或差异化观点
投资含义：受影响资产、方向和传导逻辑
证据属性：帖子观点 / 信息线索待一级来源确认”

X帖子本身不能证明公司、监管、政策或宏观事实，禁止使用“已确认事实”。只引用最终入选帖，不要返回搜索候选或被淘汰帖的引用。不得把作者观点写成事实。若没有任何帖子满足全部门槛，只回答“本组账号过去30小时无重大新增”，不要附带链接、解释或候选内容。使用简洁中文，不写方法说明。"""
        answer, citations, usage = _call_xai(
            [{"role": "user", "content": prompt}],
            {
                "type": "x_search",
                "allowed_x_handles": batch,
                "from_date": window_start.date().isoformat(),
                "to_date": current.date().isoformat(),
            },
        )
        if "无重大新增" in answer:
            citations = []
        else:
            selected_count = max(1, answer.count("｜香港时间"))
            citations = citations[:min(selected_count, 3)]
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
        if self.path not in {"/holdings", "/x-digest"}:
            self._json(404, {"error": "not_found"}); return
        try:
            if self.path == "/x-digest":
                initialized, digest = read_x_digest()
                self._json(200, {"initialized": initialized, **digest})
                return
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
                digest = build_x_digest(handles)
                write_x_digest(digest)
                self._json(200, digest)
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
