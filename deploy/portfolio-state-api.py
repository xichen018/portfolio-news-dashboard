#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

DATA_FILE = Path(os.getenv("PORTFOLIO_STATE_FILE", "/var/lib/portfolio-news-dashboard/holdings.json"))
MAX_BODY = 256 * 1024
MARKETS = {"美股", "A股", "港股", "加密", "其他"}
DIRECTIONS = {"多", "空", "空2x"}


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
