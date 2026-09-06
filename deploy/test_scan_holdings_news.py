import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("scan_holdings_news", Path(__file__).with_name("scan-holdings-news.py"))
SCANNER = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(SCANNER)


class HoldingsNewsFilterTests(unittest.TestCase):
    def test_equity_material_event_is_kept(self):
        self.assertTrue(SCANNER.is_material_title("MU", "Micron raises earnings guidance and expands buyback"))

    def test_price_commentary_is_rejected(self):
        self.assertFalse(SCANNER.is_material_title("MU", "MU stock price forecast: will shares jump after earnings?"))

    def test_crypto_regulatory_event_is_kept(self):
        self.assertTrue(SCANNER.is_material_title("BTC", "SEC approves spot ETF rule change"))

    def test_incidental_law_word_is_rejected(self):
        self.assertFalse(SCANNER.is_material_title("BTC", "Bitcoin power laws and complex price models"))


if __name__ == "__main__":
    unittest.main()
