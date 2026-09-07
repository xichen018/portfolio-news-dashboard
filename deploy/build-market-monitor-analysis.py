#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPORT_FILE = Path(os.getenv("PORTFOLIO_REPORT_FILE", "/var/www/portfolio-news-dashboard/data/latest.json"))
CALENDAR_FILE = Path(os.getenv("PORTFOLIO_CALENDAR_FILE", "/var/www/portfolio-news-dashboard/data/monthly-calendar.json"))
OUTPUT_FILE = Path(os.getenv("PORTFOLIO_MARKET_ANALYSIS_FILE", "/var/lib/portfolio-news-dashboard/market-analysis.json"))
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
OPENAI_URL = f"{OPENAI_BASE_URL}/responses"
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.6-terra")
OPENAI_REASONING_EFFORT = os.getenv("OPENAI_REASONING_EFFORT", "low")

SYSTEM_PROMPT = """你是服务职业投资者的中文跨资产策略分析师。只能使用输入JSON中的事实，不得使用模型记忆补充当前事实，不得编造数值、共识、因果、资金流、交易阈值或仓位比例。没有前值不得声称指标上升或下降；没有用户风险预算不得提出机械减仓幅度；未来事件的预期不得写成已经发生。明确区分事实、解释和建议。缺少比较基准时写“待补数据”。输出必须紧凑、可执行，不写免责声明、方法说明或工程术语。"""

PROMPTS = {
    "宏观信息": """分析过滤后的本月核心宏观事件。先区分已公布结果与未来事件；已公布事件比较实际值、预期值和前值，解释利率、美元、股指、黄金的传导；未来事件给出基准/偏强/偏弱情景、决策变量和确认信号。不得把未公布事件写成结论。""",
    "资金流向与资金成本": """分析资金成本与金融条件。严格区分政策利率、美债收益率、美元条件和真实资金流；没有ETF流量、基金仓位或流动性变化时，不得声称资金流入或流出。单点水平只能描述当前资金价格，不能判断收紧或放松。说明对成长股、黄金、BTC及组合久期的条件式传导，并给出需要观察的变化与失效条件。禁止生成输入中不存在的数值触发线。""",
    "市场估值与潜在风险": """分析估值与潜在风险。严格区分VIX风险定价、估值倍数、信用利差、市场宽度与仓位拥挤；单点VIX不得被解释为市场便宜、昂贵或风险已解除。只有多项证据确认时才提高风险等级，并明确当前缺失的估值与风险证据。""",
}


def extract_text(payload: dict[str, Any]) -> str:
    parts = []
    for output in payload.get("output", []):
        if not isinstance(output, dict) or output.get("type") != "message":
            continue
        for content in output.get("content", []):
            if isinstance(content, dict) and content.get("type") == "output_text" and isinstance(content.get("text"), str):
                parts.append(content["text"].strip())
    text = "\n\n".join(part for part in parts if part)
    if not text:
        raise RuntimeError("empty_response")
    return text


def call_model(category: str, facts: list[dict]) -> str:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("not_configured")
    user_prompt = f"""{PROMPTS[category]}

仅按以下格式输出：
结论：
关键证据：
传导路径：
情景与决策点：
失效条件：
证据缺口：

输入JSON：
{json.dumps(facts, ensure_ascii=False, separators=(',', ':'))}"""
    request = urllib.request.Request(
        OPENAI_URL,
        data=json.dumps({"model": OPENAI_MODEL, "instructions": SYSTEM_PROMPT, "input": [{"role": "user", "content": user_prompt}], "max_output_tokens": 900, "reasoning": {"effort": OPENAI_REASONING_EFFORT}, "text": {"verbosity": "low"}}).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return extract_text(json.loads(response.read()))


def build_facts(report: dict, calendar: dict) -> dict[str, list[dict]]:
    macro = [{key: event.get(key) for key in ("title_zh", "event_at", "actual", "consensus", "previous", "result_summary_zh", "market_impact_zh", "publisher", "source_url") if event.get(key) is not None} for event in calendar.get("events", [])]
    observations = []
    for task in report.get("tasks", []):
        for item in task.get("macro_observations", []):
            if item.get("metric_id") in {"dff", "dgs10", "dtwexbgs", "vixcls"}:
                source_map = {source.get("source_id"): source for source in task.get("sources", [])}
                source = next((source_map.get(source_id) for source_id in item.get("source_ids", []) if source_map.get(source_id)), None)
                observations.append({"metric_id": item.get("metric_id"), "label": item.get("label"), "value": item.get("value"), "unit": item.get("unit"), "period": item.get("period"), "prior": item.get("prior"), "publisher": source.get("publisher") if source else None, "source_url": source.get("url") if source else None})
    return {
        "宏观信息": macro,
        "资金流向与资金成本": [item for item in observations if item["metric_id"] in {"dff", "dgs10", "dtwexbgs"}],
        "市场估值与潜在风险": [item for item in observations if item["metric_id"] == "vixcls"],
    }


def main() -> int:
    report = json.loads(REPORT_FILE.read_text(encoding="utf-8")); calendar = json.loads(CALENDAR_FILE.read_text(encoding="utf-8")); facts = build_facts(report, calendar)
    analyses = {}; successful = 0
    for category in PROMPTS:
        try:
            analyses[category] = {"text": call_model(category, facts[category]), "fact_count": len(facts[category])}; successful += 1
        except Exception:
            analyses[category] = {"text": "待补数据：本次模型分析未生成，保留上一层结构化事实。", "fact_count": len(facts[category])}
    if successful == 0:
        return 1
    payload = {"generated_at": datetime.now(timezone.utc).isoformat(), "report_run_id": report.get("run_context", {}).get("run_id"), "provider": "OpenAI", "model": OPENAI_MODEL, "analyses": analyses}
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix="market-analysis-", suffix=".tmp", dir=OUTPUT_FILE.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2); handle.flush(); os.fsync(handle.fileno())
        os.replace(temporary, OUTPUT_FILE); os.chmod(OUTPUT_FILE, 0o600)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)
    return 0


if __name__ == "__main__": raise SystemExit(main())
