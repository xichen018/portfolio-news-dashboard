from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


SPEC = importlib.util.spec_from_file_location("portfolio_state_api", Path(__file__).with_name("portfolio-state-api.py"))
assert SPEC and SPEC.loader
API = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(API)


class StateApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        API.DATA_FILE = Path(self.temp.name) / "holdings.json"

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


if __name__ == "__main__":
    unittest.main()
