#!/usr/bin/env python3
from __future__ import annotations

import json
import html
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
from html.parser import HTMLParser
from pathlib import Path
from zoneinfo import ZoneInfo

BLS_URL = "https://www.bls.gov/schedule/news_release/bls.ics"
BEA_URL = "https://www.bea.gov/news/schedule"
FOMC_URL = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
IMPORTANT_BLS = re.compile(r"^(Employment Situation|Consumer Price Index|Producer Price Index|Job Openings and Labor Turnover Survey)")
IMPORTANT_BEA = re.compile(r"(GDP|Personal Income and Outlays|International Trade in Goods and Services)", re.I)
INVESTING_CALENDAR_URL = "https://www.investing.com/economic-calendar/"
NASDAQ_CALENDAR_URL = "https://api.nasdaq.com/api/calendar/economicevents"
IMPORTANT_NASDAQ = re.compile(
    r"Payroll|Employment|Unemployment|Jobless Claims|Average Hourly Earnings|CPI|PPI|PCE|GDP|"
    r"PMI|ISM|Retail Sales|Consumer Confidence|Consumer Sentiment|Durable Goods|Factory Orders|"
    r"Trade Balance|Existing Home Sales|New Home Sales|Building Permits|Housing Starts|"
    r"Fed |FOMC|Crude Oil Inventories|Natural Gas Storage",
    re.I,
)
NASDAQ_HIGH = re.compile(
    r"Nonfarm Payroll|Unemployment Rate|CPI|PPI|PCE Price|GDP|ISM (Manufacturing|Non-Manufacturing) PMI|"
    r"Retail Sales|Fed Interest Rate Decision|FOMC Statement",
    re.I,
)
NASDAQ_TITLE_ZH = {
    "Nonfarm Payrolls": "美国非农就业报告",
    "Unemployment Rate": "美国失业率",
    "Average Hourly Earnings": "美国平均时薪（月率）",
    "Average Hourly Earnings (YoY)": "美国平均时薪（年率）",
    "Initial Jobless Claims": "美国初请失业金人数",
    "Continuing Jobless Claims": "美国续请失业金人数",
    "Trade Balance": "美国贸易帐",
    "S&P Global Composite PMI": "美国S&P Global综合PMI",
    "S&P Global Services PMI": "美国S&P Global服务业PMI",
    "ISM Non-Manufacturing PMI": "美国ISM非制造业PMI",
    "ISM Non-Manufacturing Prices": "美国ISM非制造业价格指数",
}
TITLE_ZH = {
    "Employment Situation": "美国非农就业报告",
    "Consumer Price Index": "美国消费者价格指数（CPI）",
    "Producer Price Index": "美国生产者价格指数（PPI）",
    "Job Openings and Labor Turnover Survey": "美国职位空缺与劳动力流动调查（JOLTS）",
}
EVENT_RESULTS = {
    ("2026-09-04", "美国非农就业报告"): {
        "actual": "新增16.2万",
        "consensus": "新增5.6万",
        "result_summary_zh": "美国8月非农就业新增16.2万，显著高于Reuters调查预期的5.6万；失业率维持4.1%。",
        "market_impact_zh": "强就业推动美债收益率上行，市场重新计价更鹰派的美联储路径，美股收低，黄金承压。",
        "result_publisher": "Reuters",
        "result_source_url": "https://www.reuters.com/business/us-nonfarm-payrolls-surge-august-unemployment-rate-steady-41-2026-09-04/",
    },
}

def investing_importance(title: str) -> str | None:
    """Categories Investing.com explicitly describes as highest-impact events."""
    return "high" if re.search(r"Nonfarm|Employment Situation|GDP|Consumer Price Index|Unemployment", title, re.I) else None

def add_known_result(event: dict) -> dict:
    result=EVENT_RESULTS.get((event["event_at"][:10],event["title_zh"]))
    return {**event,**result} if result else event

def fetch(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36", "Accept": "application/json,text/html,*/*", "Accept-Language": "en-US,en;q=0.9", "Referer": "https://www.nasdaq.com/market-activity/economic-calendar"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")

class BeaParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(); self.in_row=False; self.field=None; self.buffer=[]; self.current={}; self.rows=[]
    def handle_starttag(self, tag, attrs):
        classes=dict(attrs).get("class","")
        if tag=="tr" and "scheduled-releases-type-press" in classes: self.in_row=True; self.current={}
        if self.in_row and tag=="td":
            self.field="date" if "scheduled-date" in classes else "title" if "release-title" in classes else None; self.buffer=[]
    def handle_data(self,data):
        if self.in_row and self.field: self.buffer.append(data)
    def handle_endtag(self,tag):
        if self.in_row and tag=="td" and self.field:
            self.current[self.field]=" ".join(" ".join(self.buffer).split()); self.field=None
        if self.in_row and tag=="tr": self.rows.append(self.current); self.in_row=False

class FomcParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(); self.year=None; self.capture=None; self.parts=[]; self.month=""; self.meetings=[]
    def handle_starttag(self,tag,attrs):
        classes=dict(attrs).get("class","")
        if tag=="div" and "fomc-meeting__month" in classes: self.capture="month"; self.parts=[]
        elif tag=="div" and "fomc-meeting__date" in classes: self.capture="date"; self.parts=[]
    def handle_data(self,data):
        text=data.strip(); match=re.fullmatch(r"(\d{4}) FOMC Meetings",text)
        if match: self.year=int(match.group(1))
        if self.capture and text: self.parts.append(text)
    def handle_endtag(self,tag):
        if tag!="div" or not self.capture: return
        value=" ".join(self.parts).strip()
        if self.capture=="month": self.month=value
        elif self.year and self.month: self.meetings.append((self.year,self.month,value))
        self.capture=None; self.parts=[]

def bls_events(year: int, month: int) -> list[dict]:
    text=fetch(BLS_URL).replace("\r\n ","").replace("\n ",""); events=[]
    for block in text.split("BEGIN:VEVENT")[1:]:
        start=re.search(r"DTSTART;TZID=US-Eastern:(\d{8}T\d{6})",block); summary=re.search(r"SUMMARY:(.+)",block)
        if not start or not summary or not IMPORTANT_BLS.search(summary.group(1)): continue
        eastern=datetime.strptime(start.group(1),"%Y%m%dT%H%M%S").replace(tzinfo=ZoneInfo("America/New_York"))
        if (eastern.year,eastern.month)!=(year,month): continue
        raw=summary.group(1).strip(); base=next((key for key in TITLE_ZH if raw.startswith(key)),raw)
        events.append({"id":f"bls-{start.group(1)}-{base}","title_zh":TITLE_ZH.get(base,base),"event_at":eastern.astimezone(ZoneInfo("Asia/Hong_Kong")).isoformat(),"original_timezone":"America/New_York","original_time_label":eastern.strftime("%Y-%m-%d %H:%M %Z"),"publisher":"U.S. Bureau of Labor Statistics","source_url":BLS_URL,"importance":investing_importance(raw),"importance_publisher":"Investing.com" if investing_importance(raw) else None,"importance_source_url":INVESTING_CALENDAR_URL if investing_importance(raw) else None})
    return events

def bea_events(year: int, month: int) -> list[dict]:
    parser=BeaParser(); parser.feed(fetch(BEA_URL)); events=[]
    for row in parser.rows:
        title=row.get("title",""); match=re.search(r"([A-Z][a-z]+)\s+(\d{1,2}).*?(\d{1,2}):(\d{2})\s+(AM|PM)",row.get("date",""),re.I)
        if not match or not IMPORTANT_BEA.search(title): continue
        eastern=datetime.strptime(f"{match.group(1)} {match.group(2)} {year} {match.group(3)}:{match.group(4)} {match.group(5)}","%B %d %Y %I:%M %p").replace(tzinfo=ZoneInfo("America/New_York"))
        if eastern.month!=month: continue
        title_zh = "美国国际货物和服务贸易" if "International Trade in Goods and Services" in title else "美国GDP第三次估算、企业利润及相关地区数据" if title.startswith("GDP (Third Estimate)") else "美国个人收入与支出（含PCE）" if title.startswith("Personal Income and Outlays") else title
        events.append({"id":f"bea-{eastern:%Y%m%d}-{title}","title_zh":title_zh,"event_at":eastern.astimezone(ZoneInfo("Asia/Hong_Kong")).isoformat(),"original_timezone":"America/New_York","original_time_label":eastern.strftime("%Y-%m-%d %H:%M %Z"),"publisher":"U.S. Bureau of Economic Analysis","source_url":BEA_URL,"importance":investing_importance(title),"importance_publisher":"Investing.com" if investing_importance(title) else None,"importance_source_url":INVESTING_CALENDAR_URL if investing_importance(title) else None})
    return events

def fomc_events(year: int, month: int) -> list[dict]:
    parser=FomcParser(); parser.feed(fetch(FOMC_URL)); events=[]
    for event_year,month_name,date_label in parser.meetings:
        try: event_month=datetime.strptime(month_name.split("/")[0].strip(),"%B").month
        except ValueError: continue
        if (event_year,event_month)!=(year,month): continue
        days=[int(value) for value in re.findall(r"\d+",date_label)]
        if not days: continue
        decision_day=max(days); event_date=datetime(year,month,decision_day,tzinfo=ZoneInfo("America/New_York"))
        events.append({"id":f"fomc-{year}{month:02d}{decision_day:02d}","title_zh":"美联储FOMC利率决议日","event_at":event_date.date().isoformat()+"T00:00:00+08:00","original_timezone":"America/New_York","original_time_label":f"{month_name} {date_label}, {year}（会议日期；声明时间待官方确认）","all_day":True,"publisher":"Federal Reserve Board","source_url":FOMC_URL,"importance":"high","importance_publisher":"Investing.com","importance_source_url":INVESTING_CALENDAR_URL})
    return events

def nasdaq_events(year: int, month: int) -> list[dict]:
    events=[]; cursor=date(year,month,1); days=[]
    next_month=date(year + (month == 12), 1 if month == 12 else month + 1, 1)
    hong_kong=ZoneInfo("Asia/Hong_Kong")
    while cursor < next_month:
        days.append(cursor); cursor += timedelta(days=1)

    def fetch_day(day: date) -> list[dict]:
        day_events=[]
        payload=json.loads(fetch(f"{NASDAQ_CALENDAR_URL}?date={day.isoformat()}"))
        for row in ((payload.get("data") or {}).get("rows") or []):
            title=" ".join(str(row.get("eventName") or "").split())
            if row.get("country") != "United States" or not IMPORTANT_NASDAQ.search(title): continue
            time_match=re.fullmatch(r"(\d{2}):(\d{2})",str(row.get("gmt") or ""))
            if not time_match: continue
            # Nasdaq's date parameter is one day ahead of the US calendar date;
            # despite the `gmt` field name, release times align with US Eastern time.
            event_day=day - timedelta(days=1)
            event_eastern=datetime(event_day.year,event_day.month,event_day.day,int(time_match.group(1)),int(time_match.group(2)),tzinfo=ZoneInfo("America/New_York"))
            event_hk=event_eastern.astimezone(hong_kong)
            clean=lambda value: " ".join(html.unescape(str(value or "")).replace("\xa0", " ").split()) or None
            importance="high" if NASDAQ_HIGH.search(title) else None
            event={"id":f"nasdaq-{event_day.isoformat()}-{time_match.group(1)}{time_match.group(2)}-{re.sub(r'[^a-z0-9]+','-',title.lower()).strip('-')}","title_zh":NASDAQ_TITLE_ZH.get(title,title),"event_at":event_hk.isoformat(),"original_timezone":"America/New_York","original_time_label":event_eastern.strftime("%Y-%m-%d %H:%M %Z"),"publisher":"Nasdaq Economic Calendar","source_url":f"{NASDAQ_CALENDAR_URL}?date={day.isoformat()}","importance":importance,"importance_publisher":"Investing.com" if importance else None,"importance_source_url":INVESTING_CALENDAR_URL if importance else None,"actual":clean(row.get("actual")),"consensus":clean(row.get("consensus")),"previous":clean(row.get("previous"))}
            day_events.append({key:value for key,value in event.items() if value is not None})
        return day_events

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures=[executor.submit(fetch_day,day) for day in days]
        for future in as_completed(futures):
            try: events.extend(future.result())
            except Exception: continue
    return events

def merge_events(events: list[dict]) -> list[dict]:
    """Prefer official releases; Nasdaq enriches coverage and values without replacing authority."""
    official=[event for event in events if not event["id"].startswith("nasdaq-")]
    merged=list(official)
    for event in (item for item in events if item["id"].startswith("nasdaq-")):
        title=event["id"].lower()
        duplicate=next((item for item in official if item["event_at"][:10] == event["event_at"][:10] and (
            ("employment situation" in item["id"].lower() and ("payroll" in title or "unemployment" in title)) or
            ("consumer price index" in item["id"].lower() and "cpi" in title) or
            ("producer price index" in item["id"].lower() and "ppi" in title)
        )),None)
        if duplicate:
            for key in ("actual","consensus","previous"):
                if event.get(key) and not duplicate.get(key): duplicate[key]=event[key]
        else: merged.append(event)
    return merged

def main() -> int:
    now=datetime.now(ZoneInfo("Asia/Hong_Kong")); events=[]; errors=[]
    for provider in (bls_events,bea_events,fomc_events,nasdaq_events):
        try: events.extend(provider(now.year,now.month))
        except Exception as exc: errors.append(f"{provider.__name__}: {type(exc).__name__}")
    if not events: return 1
    payload={"generated_at":now.isoformat(),"timezone":"Asia/Hong_Kong","month":now.strftime("%Y-%m"),"events":sorted((add_known_result(event) for event in merge_events(events)),key=lambda item:(item["event_at"],item["title_zh"])),"provider_gaps":errors}
    target=Path(sys.argv[1]); target.parent.mkdir(parents=True,exist_ok=True); temporary=target.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8"); temporary.replace(target); return 0

if __name__=="__main__": raise SystemExit(main())
