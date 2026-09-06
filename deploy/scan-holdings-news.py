#!/usr/bin/env python3
from __future__ import annotations

import argparse
import email.utils
import fcntl
import hashlib
import html
import json
import os
import re
import tempfile
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

HOLDINGS_FILE = Path(os.getenv("PORTFOLIO_STATE_FILE", "/var/lib/portfolio-news-dashboard/holdings.json"))
OUTPUT_FILE = Path(os.getenv("PORTFOLIO_NEWS_FILE", "/var/www/portfolio-news-dashboard/data/holdings-news.json"))
LOCK_FILE = Path(os.getenv("PORTFOLIO_NEWS_LOCK", "/var/lib/portfolio-news-dashboard/news-scan.lock"))
USER_AGENT = "portfolio-news-dashboard/1.0 research@localhost"
NEWS_WINDOW = timedelta(hours=48)
MATERIAL_FORMS = {"8-K", "10-K", "10-Q", "20-F", "6-K", "S-3", "S-4", "SC 13D", "SC 13G", "DEF 14A"}
NOISE_NEWS = re.compile(
    r"price prediction|price forecast|technical analysis|trading strateg|price target|"
    r"stock jumps|options? (?:activity|volume|spot-on)|futures: prices|presale|"
    r"what to know|why is|could .* reach|forecast: will|tokenized|presale|award|"
    r"分析|预测|目标价|期权异动|喊单|代币化",
    re.I,
)
EQUITY_MATERIAL = re.compile(
    r"earnings|quarterly results|guidance|outlook|revenue warning|margin warning|"
    r"buyback|repurchase|dividend|acquisition|merger|strategic sale|bankruptcy|"
    r"lawsuit|investigation|subpoena|regulator|antitrust|(?:CEO|CFO).*(?:resign|step down|appoint)|"
    r"(?:resign|appoint).*(?:CEO|CFO)|layoff|recall|data breach|outage|major contract|"
    r"production halt|plant closure|strike|订单|财报|业绩|指引|回购|并购|收购|诉讼|调查|"
    r"监管|管理层变动|裁员|召回|安全事件|停产|罢工",
    re.I,
)
CRYPTO_MATERIAL = re.compile(
    r"\b(?:SEC|CFTC|regulator|regulation|court|law|ban|approval)\b|spot ETF|ETF (?:inflow|outflow)|"
    r"exchange hack|custod|exploit|Bitcoin (?:security breach|network outage)|treasury (?:buy|sell|sale)|"
    r"institutional (?:buy|sell|holding)|liquidat(?:ion|ed).*(?:billion|million)|"
    r"监管|批准|禁令|现货ETF|资金流|交易所被盗|托管|漏洞|网络中断|机构买入|机构卖出|清算",
    re.I,
)
TRUSTED_PUBLISHER = re.compile(
    r"Reuters|Bloomberg|CNBC|Wall Street Journal|Financial Times|Barron's|MarketWatch|"
    r"Associated Press|Yahoo Finance|CoinDesk|The Block|Decrypt|CryptoSlate|"
    r"GlobeNewswire|Business Wire|PR Newswire|Micron Technology",
    re.I,
)
COMPANY_ALIASES = {"MU": "Micron Technology", "BTC": "Bitcoin", "BTCUSDT": "Bitcoin"}


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json,application/xml,text/xml,*/*"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def load_existing() -> list[dict]:
    try:
        payload = json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))
        return payload.get("news", []) if isinstance(payload, dict) else []
    except (OSError, ValueError):
        return []


def is_material_title(ticker: str, title: str) -> bool:
    if NOISE_NEWS.search(title):
        return False
    pattern = CRYPTO_MATERIAL if ticker in {"BTC", "BTCUSDT"} else EQUITY_MATERIAL
    return bool(pattern.search(title))


def rss_news(holding: dict, now: datetime) -> list[dict]:
    ticker = str(holding.get("ticker", "")).upper()
    name = COMPANY_ALIASES.get(ticker, str(holding.get("name", "")))
    query = urllib.parse.quote_plus(f'"{name}" {ticker} when:2d')
    root = ET.fromstring(fetch(f"https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"))
    results = []
    for item in root.findall("./channel/item"):
        title = html.unescape(item.findtext("title", "")).strip()
        if not title or not is_material_title(ticker, title):
            continue
        published = email.utils.parsedate_to_datetime(item.findtext("pubDate", "")).astimezone(timezone.utc)
        if published < now - NEWS_WINDOW or published > now + timedelta(minutes=5):
            continue
        link = item.findtext("link", "").strip()
        publisher = item.findtext("source", "Google News").strip()
        if not TRUSTED_PUBLISHER.search(publisher):
            continue
        advice = "先核对公司公告或监管文件，再判断是否改变盈利、现金流或估值假设；只有影响原持仓论点时才调整仓位。"
        if re.search(r"earnings|guidance|forecast|财报|指引", title, re.I):
            advice = "对照实际业绩、指引与市场一致预期，重点检查收入、毛利率和下一期指引；标题本身不足以判断利好或利空。"
        elif re.search(r"buyback|repurchase|回购", title, re.I):
            advice = "核对回购授权、执行规模、期限及资金来源；授权不等于实际买入，需结合估值和自由现金流判断。"
        digest = hashlib.sha256(f"{ticker}|{published.isoformat()}|{title}".encode()).hexdigest()[:16]
        results.append({"id": f"live-news-{digest}", "ticker": ticker, "title": title, "source": publisher, "sentiment": "中性", "kind": "重大新闻", "url": link, "filterReason": "48小时内持仓相关且命中重大事项过滤词；待一级来源确认", "aiAdvice": advice, "ts": int(published.timestamp() * 1000)})
    return results


def sec_ticker_map() -> dict[str, tuple[int, str]]:
    payload = json.loads(fetch("https://www.sec.gov/files/company_tickers.json"))
    return {str(item["ticker"]).upper(): (int(item["cik_str"]), str(item["title"])) for item in payload.values()}


def sec_news(holding: dict, mapping: dict[str, tuple[int, str]], now: datetime) -> list[dict]:
    ticker = str(holding.get("ticker", "")).upper()
    if ticker not in mapping:
        return []
    cik, company = mapping[ticker]
    payload = json.loads(fetch(f"https://data.sec.gov/submissions/CIK{cik:010d}.json"))
    recent = payload.get("filings", {}).get("recent", {})
    results = []
    for index, form in enumerate(recent.get("form", [])):
        if form not in MATERIAL_FORMS:
            continue
        accepted_raw = recent.get("acceptanceDateTime", [])[index]
        accepted = datetime.fromisoformat(accepted_raw.replace("Z", "+00:00")).astimezone(timezone.utc)
        if accepted < now - NEWS_WINDOW or accepted > now + timedelta(minutes=5):
            continue
        accession = recent["accessionNumber"][index]
        primary = recent["primaryDocument"][index]
        url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession.replace('-', '')}/{primary}"
        title = f"{company} 提交 {form} 文件"
        results.append({"id": f"live-sec-{ticker}-{accession}", "ticker": ticker, "title": title, "source": "SEC EDGAR", "sentiment": "中性", "kind": "SEC披露", "url": url, "filterReason": f"SEC EDGAR 新披露；表格 {form}；需阅读正文判断重要性", "aiAdvice": "先检查披露事项、财务影响、生效时间和管理层解释；表格类型本身不代表利好或利空。", "ts": int(accepted.timestamp() * 1000)})
    return results


def write_payload(news: list[dict], now: datetime) -> None:
    cutoff = int((now - NEWS_WINDOW).timestamp() * 1000)
    unique = {item["id"]: item for item in news if isinstance(item, dict) and int(item.get("ts", 0)) >= cutoff}
    payload = {"generated_at": now.isoformat(), "window_hours": 48, "news": sorted(unique.values(), key=lambda item: item["ts"], reverse=True)}
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix="holdings-news-", suffix=".tmp", dir=OUTPUT_FILE.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.flush(); os.fsync(handle.fileno())
        os.replace(temporary, OUTPUT_FILE); os.chmod(OUTPUT_FILE, 0o644)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)


def main() -> int:
    parser = argparse.ArgumentParser(); parser.add_argument("--source", choices=("news", "sec"), required=True); args = parser.parse_args()
    now = datetime.now(timezone.utc); holdings = json.loads(HOLDINGS_FILE.read_text(encoding="utf-8"))
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    with LOCK_FILE.open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        existing = load_existing(); additions = []
        if args.source == "news":
            for holding in holdings:
                try: additions.extend(rss_news(holding, now))
                except Exception: continue
        else:
            mapping = sec_ticker_map()
            for holding in holdings:
                try: additions.extend(sec_news(holding, mapping, now))
                except Exception: continue
        write_payload(existing + additions, now)
    return 0


if __name__ == "__main__": raise SystemExit(main())
