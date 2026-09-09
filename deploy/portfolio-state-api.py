#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import crypt
import hashlib
import hmac
import secrets
import subprocess
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

DATA_FILE = Path(os.getenv("PORTFOLIO_STATE_FILE", "/var/lib/portfolio-news-dashboard/holdings.json"))
USAGE_FILE = Path(os.getenv("XAI_USAGE_FILE", "/var/lib/portfolio-news-dashboard/xai-usage.json"))
DIGEST_FILE = Path(os.getenv("XAI_DIGEST_FILE", "/var/lib/portfolio-news-dashboard/x-digest.json"))
MAX_BODY = 256 * 1024
STATE_KEYS = {
    "cockpit.events.v1": "events.json",
    "cockpit.news.v1": "news.json",
    "cockpit.twitter.v1": "twitter.json",
    "cockpit.x-digest.v1": "x-digest-user.json",
    "cockpit.x-chat.v1": "x-chat.json",
    "cockpit.ideas.v1": "ideas.json",
    "cockpit.trades.v1": "trades.json",
}
MAX_CHAT_MESSAGES = 20
MAX_CHAT_CHARS = 24_000
MAX_DAILY_CHAT_REQUESTS = int(os.getenv("XAI_DAILY_REQUEST_LIMIT", "40"))
XAI_URL = "https://api.x.ai/v1/responses"
XAI_MODEL = os.getenv("XAI_MODEL", "grok-4.3")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.6-terra")
_usage_lock = threading.Lock()
MARKETS = {"美股", "A股", "港股", "加密", "其他"}
DIRECTIONS = {"多", "空", "空2x"}
USER_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
AUTH_FILE = Path(os.getenv("PORTFOLIO_AUTH_FILE", "/etc/nginx/portfolio-dashboard.htpasswd"))
SESSION_SECRET_FILE = Path(os.getenv("PORTFOLIO_SESSION_SECRET_FILE", DATA_FILE.parent / "session-secret"))
SESSION_SECONDS = 7 * 24 * 60 * 60
NEWS_SCANNER = os.getenv("PORTFOLIO_NEWS_SCANNER", "/usr/local/bin/scan-portfolio-news")

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


def user_root(user: str) -> Path:
    if not USER_RE.fullmatch(user):
        raise ValueError("invalid user")
    return DATA_FILE.parent / "users" / user


def holdings_path(user: str) -> Path:
    return user_root(user) / "holdings.json"


def digest_path(user: str) -> Path:
    return user_root(user) / "x-digest.json"


def news_path(user: str) -> Path:
    return user_root(user) / "holdings-news.json"


def analysis_path(user: str) -> Path:
    return user_root(user) / "holding-analysis.json"


def yahoo_symbol(holding: dict[str, Any]) -> str:
    ticker = holding["ticker"].upper()
    if holding["market"] == "港股":
        return f"{ticker.lstrip('0') or '0'}.HK"
    if holding["market"] == "加密" and ticker == "BTC":
        return "BTC-USD"
    return ticker


def technical_facts(holding: dict[str, Any]) -> dict[str, Any]:
    symbol = yahoo_symbol(holding)
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?range=1y&interval=1d"
    request = urllib.request.Request(url, headers={"User-Agent": "portfolio-news-dashboard/1.0"})
    with urllib.request.urlopen(request, timeout=20) as response:
        result = json.loads(response.read())["chart"]["result"][0]
    quotes = result["indicators"]["quote"][0]
    closes = [float(value) for value in quotes.get("close", []) if isinstance(value, (int, float))]
    volumes = [float(value) for value in quotes.get("volume", []) if isinstance(value, (int, float))]
    if len(closes) < 15:
        raise ValueError("insufficient price history")
    def sma(days: int) -> float | None:
        return round(sum(closes[-days:]) / days, 4) if len(closes) >= days else None
    changes = [closes[index] - closes[index - 1] for index in range(1, len(closes))][-14:]
    gains = sum(max(value, 0) for value in changes) / 14
    losses = sum(max(-value, 0) for value in changes) / 14
    rsi = 100 if losses == 0 else 100 - 100 / (1 + gains / losses)
    return {"symbol": symbol, "name": result.get("meta", {}).get("shortName"), "instrument_type": result.get("meta", {}).get("instrumentType"), "currency": result.get("meta", {}).get("currency"), "price": round(closes[-1], 4), "observations": len(closes), "sma20": sma(20), "sma50": sma(50), "sma200": sma(200), "rsi14": round(rsi, 2), "return_20d_pct": round((closes[-1] / closes[-21] - 1) * 100, 2) if len(closes) >= 21 else None, "volume_vs_20d": round(volumes[-1] / (sum(volumes[-20:]) / 20), 2) if len(volumes) >= 20 and sum(volumes[-20:]) else None, "source_url": url}


def holding_analysis_prompt(holding: dict[str, Any], facts: dict[str, Any]) -> str:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("not_configured")
    instructions = """你是职业投资者的持仓研究助手。只能使用输入JSON事实，不得用记忆补当前基本面、估值、新闻或价格。先识别股票或ETF：ETF不得套用公司财务分析，必须说明底层资产、跟踪、汇率与再平衡数据缺口。技术面至少结合趋势、动量、区间或量价中的两项；历史不足200个交易日时不得判断200日均线。技术指标不能证明基本面变化。用户论点为空时不得代写。输出紧凑中文，缺失证据写待补数据。"""
    prompt = """按以下格式输出：
标的类型：
证据等级：强 / 中 / 弱 / 不可判断
结论：
基本面：
技术结构：
主要催化剂：
主要风险：
持仓论点：
市场可能已计价：
决策点：
失效条件：
证据缺口：

输入JSON：""" + json.dumps({"holding": holding, "technical_facts": facts, "fundamental_facts": []}, ensure_ascii=False, separators=(",", ":"))
    request = urllib.request.Request(f"{OPENAI_BASE_URL}/responses", data=json.dumps({"model": OPENAI_MODEL, "instructions": instructions, "input": prompt, "max_output_tokens": 700, "reasoning": {"effort": "low"}, "text": {"verbosity": "low"}}).encode(), headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = json.loads(response.read())
    parts = [content.get("text", "").strip() for output in payload.get("output", []) if output.get("type") == "message" for content in output.get("content", []) if content.get("type") == "output_text"]
    text = "\n".join(part for part in parts if part)
    if not text:
        raise RuntimeError("empty_response")
    return text


def refresh_holding_analysis(user: str) -> dict[str, Any]:
    holdings = read_state(user)[1]
    analyses = []
    for holding in holdings:
        try:
            facts = technical_facts(holding)
            text = holding_analysis_prompt(holding, facts)
            analyses.append({"ticker": holding["ticker"], "text": text, "technical_facts": facts})
        except Exception:
            analyses.append({"ticker": holding["ticker"], "text": "待补数据：本次行情或模型分析未生成。", "technical_facts": {}})
    payload = {"generated_at": datetime.now(timezone.utc).isoformat(), "model": OPENAI_MODEL, "analyses": analyses}
    path = analysis_path(user); path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix="holding-analysis-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2); handle.flush(); os.fsync(handle.fileno())
        os.replace(temporary, path); os.chmod(path, 0o600)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)
    return payload


def read_holdings_news(user: str) -> dict[str, Any]:
    path = news_path(user)
    if not path.exists():
        return {"generated_at": None, "window_hours": 48, "news": []}
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or not isinstance(payload.get("news"), list):
        raise ValueError("invalid news state")
    return payload


def refresh_holdings_news(user: str) -> dict[str, Any]:
    holdings = holdings_path(user)
    if not holdings.exists():
        return read_holdings_news(user)
    target = news_path(user)
    env = {**os.environ, "PORTFOLIO_STATE_FILE": str(holdings), "PORTFOLIO_NEWS_FILE": str(target), "PORTFOLIO_NEWS_LOCK": str(user_root(user) / "news-scan.lock")}
    for source in ("news", "sec"):
        subprocess.run([NEWS_SCANNER, "--source", source], env=env, check=True, timeout=180, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return read_holdings_news(user)


def _session_secret() -> bytes:
    if not SESSION_SECRET_FILE.exists():
        SESSION_SECRET_FILE.parent.mkdir(parents=True, exist_ok=True)
        SESSION_SECRET_FILE.write_text(secrets.token_hex(32), encoding="ascii")
        os.chmod(SESSION_SECRET_FILE, 0o600)
    return SESSION_SECRET_FILE.read_text(encoding="ascii").strip().encode()


def create_session(user: str, now: datetime | None = None) -> str:
    user_root(user)
    expires = int((now or datetime.now(timezone.utc)).timestamp()) + SESSION_SECONDS
    payload = f"{user}|{expires}"
    signature = hmac.new(_session_secret(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}|{signature}"


def session_user(token: str, now: datetime | None = None) -> str:
    try:
        user, expires_text, signature = token.split("|", 2)
        expires = int(expires_text)
    except (ValueError, TypeError):
        raise ValueError("invalid session")
    user_root(user)
    payload = f"{user}|{expires}"
    expected = hmac.new(_session_secret(), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected) or expires < int((now or datetime.now(timezone.utc)).timestamp()):
        raise ValueError("invalid session")
    return user


def verify_password(user: str, password: str) -> bool:
    if not USER_RE.fullmatch(user) or not password or len(password) > 1024:
        return False
    try:
        entries = AUTH_FILE.read_text(encoding="utf-8").splitlines()
    except OSError:
        return False
    encoded = next((line.split(":", 1)[1] for line in entries if line.startswith(f"{user}:") and ":" in line), None)
    return bool(encoded and hmac.compare_digest(crypt.crypt(password, encoded), encoded))


def read_state(user: str) -> tuple[bool, list[dict[str, Any]]]:
    path = holdings_path(user)
    if not path.exists():
        return False, []
    return True, validate_holdings(json.loads(path.read_text(encoding="utf-8")))


def write_state(user: str, holdings: list[dict[str, Any]]) -> None:
    path = holdings_path(user)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix="holdings-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(holdings, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def validate_user_state(value: Any, depth: int = 0) -> Any:
    if depth > 12:
        raise ValueError("state is too deeply nested")
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        if len(value) > 24_000:
            raise ValueError("state string is too large")
        return value
    if isinstance(value, list):
        if len(value) > 500:
            raise ValueError("state array is too large")
        return [validate_user_state(item, depth + 1) for item in value]
    if isinstance(value, dict):
        if len(value) > 100:
            raise ValueError("state object is too large")
        if any(not isinstance(key, str) or len(key) > 100 for key in value):
            raise ValueError("invalid state key")
        return {key: validate_user_state(item, depth + 1) for key, item in value.items()}
    raise ValueError("unsupported state value")


def state_path(user: str, key: str) -> Path:
    filename = STATE_KEYS.get(key)
    if not filename:
        raise ValueError("unsupported state key")
    return user_root(user) / "state" / filename


def read_user_state(user: str, key: str) -> tuple[bool, Any]:
    path = state_path(user, key)
    if not path.exists():
        return False, None
    return True, validate_user_state(json.loads(path.read_text(encoding="utf-8")))


def write_user_state(user: str, key: str, value: Any) -> None:
    path = state_path(user, key)
    clean = validate_user_state(value)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix="state-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(clean, handle, ensure_ascii=False, separators=(",", ":"))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def read_x_digest(user: str) -> tuple[bool, dict[str, Any]]:
    path = digest_path(user)
    if not path.exists():
        return False, {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or not isinstance(payload.get("generated_at"), str) or not isinstance(payload.get("summaries"), list):
        raise ValueError("invalid digest state")
    return True, payload


def write_x_digest(user: str, payload: dict[str, Any]) -> None:
    path = digest_path(user)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix="x-digest-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        os.chmod(path, 0o600)
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
    def _user(self) -> str:
        cookies = self.headers.get("Cookie", "")
        token = next((item.split("=", 1)[1] for item in cookies.split(";") if item.strip().startswith("portfolio_session=")), "")
        return session_user(token.strip())

    def _cookie(self, value: str, max_age: int) -> None:
        self.send_header("Set-Cookie", f"portfolio_session={value}; Path=/portfolio; HttpOnly; SameSite=Strict; Max-Age={max_age}")

    def _json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        try:
            user = self._user()
        except ValueError:
            self._json(401, {"error": "authentication_required"}); return
        if self.path == "/auth/session":
            self._json(200, {"authenticated": True, "user": user}); return
        if self.path == "/auth/check":
            self._json(200, {"authenticated": True}); return
        if self.path == "/holdings-news":
            try:
                self._json(200, read_holdings_news(user))
            except Exception:
                self._json(500, {"error": "news_unavailable"})
            return
        if self.path == "/holding-analysis":
            try:
                path = analysis_path(user)
                payload = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"generated_at": None, "analyses": []}
                self._json(200, payload)
            except Exception:
                self._json(500, {"error": "analysis_unavailable"})
            return
        if self.path.startswith("/state/"):
            try:
                initialized, value = read_user_state(user, self.path.removeprefix("/state/"))
                self._json(200, {"initialized": initialized, "value": value})
            except ValueError:
                self._json(404, {"error": "not_found"})
            except Exception:
                self._json(500, {"error": "state_unavailable"})
            return
        if self.path not in {"/holdings", "/x-digest"}:
            self._json(404, {"error": "not_found"}); return
        try:
            if self.path == "/x-digest":
                initialized, digest = read_x_digest(user)
                self._json(200, {"initialized": initialized, **digest})
                return
            initialized, holdings = read_state(user)
            self._json(200, {"initialized": initialized, "holdings": holdings})
        except Exception:
            self._json(500, {"error": "state_unavailable"})

    def do_POST(self) -> None:
        if self.path == "/auth/session":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > 4096:
                    raise ValueError("invalid request size")
                payload = json.loads(self.rfile.read(length))
                user, password = payload.get("user"), payload.get("password")
                if not isinstance(user, str) or not isinstance(password, str) or not verify_password(user, password):
                    self._json(401, {"error": "invalid_credentials"}); return
                token = create_session(user)
                body = json.dumps({"authenticated": True, "user": user}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self._cookie(token, SESSION_SECONDS)
                self.end_headers(); self.wfile.write(body)
            except (ValueError, json.JSONDecodeError):
                self._json(400, {"error": "invalid_request"})
            return
        try:
            user = self._user()
        except ValueError:
            self._json(401, {"error": "authentication_required"}); return
        if self.path == "/holdings-news/refresh":
            try:
                self._json(200, refresh_holdings_news(user))
            except (subprocess.SubprocessError, OSError, ValueError):
                self._json(502, {"error": "news_refresh_failed"})
            return
        if self.path == "/holding-analysis/refresh":
            try:
                self._json(200, refresh_holding_analysis(user))
            except Exception:
                self._json(502, {"error": "analysis_refresh_failed"})
            return
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
                write_x_digest(user, digest)
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
        try:
            user = self._user()
        except ValueError:
            self._json(401, {"error": "authentication_required"}); return
        if self.path.startswith("/state/"):
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > MAX_BODY:
                    raise ValueError("invalid request size")
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict) or set(payload) != {"value"}:
                    raise ValueError("invalid state payload")
                key = self.path.removeprefix("/state/")
                write_user_state(user, key, payload["value"])
                self._json(200, {"saved": True})
            except (ValueError, json.JSONDecodeError):
                self._json(400, {"error": "invalid_state"})
            except Exception:
                self._json(500, {"error": "state_unavailable"})
            return
        if self.path != "/holdings":
            self._json(404, {"error": "not_found"}); return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY:
                raise ValueError("invalid request size")
            payload = json.loads(self.rfile.read(length))
            holdings = validate_holdings(payload.get("holdings") if isinstance(payload, dict) else None)
            write_state(user, holdings)
            self._json(200, {"saved": True, "count": len(holdings)})
        except (ValueError, json.JSONDecodeError):
            self._json(400, {"error": "invalid_holdings"})
        except Exception:
            self._json(500, {"error": "state_unavailable"})

    def do_DELETE(self) -> None:
        if self.path == "/auth/session":
            body = b'{"authenticated":false}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self._cookie("", 0)
            self.end_headers(); self.wfile.write(body)
            return
        try:
            user = self._user()
            if self.path == "/holdings":
                holdings_path(user).unlink(missing_ok=True)
            elif self.path.startswith("/state/"):
                state_path(user, self.path.removeprefix("/state/")).unlink(missing_ok=True)
            else:
                self._json(404, {"error": "not_found"}); return
            self._json(200, {"deleted": True})
        except ValueError:
            self._json(404, {"error": "not_found"})
        except Exception:
            self._json(500, {"error": "state_unavailable"})

    def log_message(self, format: str, *args: Any) -> None:
        return


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8791), Handler).serve_forever()
