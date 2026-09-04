from __future__ import annotations

import importlib.util
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch


SPEC = importlib.util.spec_from_file_location("portfolio_state_api", Path(__file__).with_name("portfolio-state-api.py"))
assert SPEC and SPEC.loader
API = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(API)


class StateApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        API.DATA_FILE = Path(self.temp.name) / "holdings.json"
        API.USAGE_FILE = Path(self.temp.name) / "usage.json"

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_round_trip_and_initialization(self) -> None:
        self.assertEqual(API.read_state(), (False, []))
        holdings = API.validate_holdings([{
            "id": "one", "ticker": "GOOG", "name": "Alphabet", "market": "美股",
            "direction": "多", "weight": 12.5, "thesis": "test", "invalidation": "test",
        }])
        API.write_state(holdings)
        self.assertEqual(API.read_state(), (True, holdings))

    def test_rejects_unknown_fields_and_invalid_weight(self) -> None:
        base = {"id": "one", "ticker": "GOOG", "name": "Alphabet", "market": "美股", "direction": "多", "weight": 10, "thesis": "", "invalidation": ""}
        with self.assertRaises(ValueError):
            API.validate_holdings([{**base, "secret": "no"}])
        with self.assertRaises(ValueError):
            API.validate_holdings([{**base, "weight": 101}])

    def test_validates_bounded_chat_ending_in_user_message(self) -> None:
        messages = API.validate_chat_messages([
            {"role": "user", "content": " BTC 怎么看？ "},
            {"role": "assistant", "content": "先看资金流。"},
            {"role": "user", "content": "X 上有什么新信息？"},
        ])
        self.assertEqual(messages[0]["content"], "BTC 怎么看？")
        with self.assertRaises(ValueError):
            API.validate_chat_messages([{"role": "assistant", "content": "不能由助手结尾"}])

    def test_daily_chat_quota_is_persisted(self) -> None:
        original_limit = API.MAX_DAILY_CHAT_REQUESTS
        API.MAX_DAILY_CHAT_REQUESTS = 2
        now = datetime(2026, 9, 4, tzinfo=timezone.utc)
        try:
            self.assertEqual(API._consume_chat_quota(now), 1)
            self.assertEqual(API._consume_chat_quota(now), 0)
            with self.assertRaisesRegex(RuntimeError, "daily_limit"):
                API._consume_chat_quota(now)
        finally:
            API.MAX_DAILY_CHAT_REQUESTS = original_limit

    def test_extracts_answer_citations_and_usage(self) -> None:
        answer, citations, usage = API._extract_xai_response({
            "output": [{"type": "message", "content": [{
                "type": "output_text", "text": "结论", "annotations": [{"url": "https://x.com/a/status/1"}],
            }]}],
            "citations": ["https://x.com/a/status/1", "https://x.com/b/status/2"],
            "usage": {"input_tokens": 10, "output_tokens": 20},
        })
        self.assertEqual(answer, "结论")
        self.assertEqual(citations, ["https://x.com/a/status/1", "https://x.com/b/status/2"])
        self.assertEqual(usage, {"input_tokens": 10, "output_tokens": 20})

    def test_call_xai_does_not_return_api_key(self) -> None:
        response = MagicMock()
        response.read.return_value = b'{"output":[{"type":"message","content":[{"type":"output_text","text":"ok"}]}]}'
        response.__enter__.return_value = response
        with patch.dict(API.os.environ, {"XAI_API_KEY": "secret-test-key"}), patch.object(API.urllib.request, "urlopen", return_value=response) as opened:
            result = API.call_xai([{"role": "user", "content": "test"}])
        request = opened.call_args.args[0]
        self.assertEqual(request.headers["Authorization"], "Bearer secret-test-key")
        self.assertNotIn("secret-test-key", repr(result))


if __name__ == "__main__":
    unittest.main()
