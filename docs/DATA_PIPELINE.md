# 数据与模型接入边界

本面板复用 `DailyReport` 已验证的数据与分析原则，但不直接复制日报的资产专属逻辑。

## 可复用数据源

- 宏观信息：FRED、Federal Reserve 官方会议日历。
- 资金流向与资金成本：FRED 利率与美元序列；资产资金流需要按标的另配来源。
- 市场估值与潜在风险：Yahoo Chart / Stooq 市场结构；SEC Company Facts 基本面；估值倍数仍需补充可靠来源。
- 持仓新闻：Google News RSS、GDELT 2.0；Marketaux 可选增强。
- SEC：SEC Company Facts 适合财务事实，重大文件披露还需要 EDGAR submissions / filings feed。
- X：面板对话通过 xAI Responses API 的 `x_search` 按需检索，保留响应提供的原帖引用。X 内容属于实时观点线索；公司、监管、宏观和事件事实仍需一级来源确认。API Key 仅由服务端环境文件注入，浏览器不接触密钥；服务端限制消息长度、输出 token 和每日请求次数。

## 处理顺序

```text
候选数据 -> 时间窗/标的/主题过滤 -> 去重与来源核验 -> 结构化事实 -> AI 分析 -> 前端展示
```

AI 只能分析过滤后、带来源的事实。输出必须区分事实、解释与建议；证据不足时显示 `待补数据`，不得用模型记忆补写。市场监测的最终过滤 Prompt 由用户提供后版本化保存。

## 后端待办

1. 建立只读 API，为前端返回带 `source_url`、`published_at`、`fetched_at` 的结构化数据。
2. 使用 OpenAI Responses API 严格结构化输出，按板块分别请求，不使用自由文本 fallback。
3. 增加服务端持久化与认证；目前浏览器 localStorage 不适合跨设备或多人使用。
4. 定时运行、失败诊断和原始证据保存在服务端日志，不在读者界面暴露异常堆栈。

生产环境通过 `deploy/publish-latest-report.sh` 在日报任务成功结束后原子发布最新的 `report_input.json`。前端读取 `/portfolio/data/latest.json`，不直接访问运行目录。

本月重要财经日历由 `deploy/build-economic-calendar.py` 从 BLS 官方 iCalendar 与 BEA 官方发布日程生成，筛选非农、CPI、PPI、JOLTS、GDP、个人收入支出/PCE和国际贸易。FOMC 日期沿用 Federal Reserve 官方会议日历。所有时间转换为香港时间，并保留原始美国东部时间标签。
