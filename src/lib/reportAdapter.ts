import type { CatalystCategory, CatalystEvent, NewsItem, PMDecision } from '@/types'

type Source = { source_id:string; provider:string; publisher:string; url:string; published_at?:string; retrieved_at:string }
type ReportNews = { headline:string; published_at:string; summary_zh:string; impact:'positive'|'negative'|'neutral'; rationale_zh:string; source_ids:string[]; outside_window:boolean }
type Analysis = { instrument_id:string; investment_view_zh:string; key_evidence_zh?:string[]; market_pricing_zh?:string; variant_view_zh?:string; catalysts_zh?:string; levels_and_actions_zh?:string; source_ids:string[] }
type NewsCandidate = ReportNews & { instrument_id?:string; symbol?:string }
type MacroObservation = { metric_id:string; label:string; value:string|number; unit:string; period:string; actual?:string|number; consensus?:string|number; prior?:string|number; source_ids:string[] }
type Task = { task_id:string; title_zh:string; market_regime_zh?:string; portfolio_implications_zh?:string; instruments:Array<{instrument_id:string;symbol:string;news:ReportNews[]}>; section_news:ReportNews[]; upcoming_events:Array<{event_at:string;confirmation_status:string;title_zh:string;why_it_matters_zh:string;transmission_variable_zh?:string;source_ids:string[]}>; macro_observations?:MacroObservation[]; investment_analyses:Analysis[]; sources:Source[] }
export type ReportPayload = { run_context:{run_id:string;scheduled_for:string};tasks:Task[] }
export type MonthlyCalendarPayload = { generated_at:string; timezone:string; month:string; events:Array<{id:string;title_zh:string;event_at:string;original_timezone:string;original_time_label:string;publisher:string;source_url:string}> }
export type MacroDecisionContext = { marketRegime?:string; portfolioImplication?:string }

const sentiment=(impact:ReportNews['impact']):NewsItem['sentiment']=>impact==='positive'?'利好':impact==='negative'?'风险':'中性'
const macroCategory=(metricId:string):CatalystCategory=>metricId==='vixcls'?'市场估值与潜在风险':/dff|dgs10|dtwexbgs|fomc/.test(metricId)?'资金流向与资金成本':'宏观信息'
const formatMetric=(item:MacroObservation)=>item.unit==='date_range'?String(item.value):`${item.value}${item.unit==='index'?'':` ${item.unit}`}`

export function adaptReport(payload:ReportPayload):{events:CatalystEvent[];news:NewsItem[];decisions:PMDecision[]}{
  const events:CatalystEvent[]=[];const news:NewsItem[]=[];const decisions:PMDecision[]=[];const seenEvents=new Set<string>();const seenNews=new Set<string>()
  for(const task of payload.tasks){
    const sources=new Map(task.sources.map((source)=>[source.source_id,source]));const analyses=new Map(task.investment_analyses.map((item)=>[item.instrument_id,item]))
    for(const analysis of task.investment_analyses||[]){const instrument=task.instruments.find((item)=>item.instrument_id===analysis.instrument_id);if(!instrument)continue;decisions.push({id:`decision-${payload.run_context.run_id}-${task.task_id}-${analysis.instrument_id}`,taskId:task.task_id,ticker:instrument.symbol,view:analysis.investment_view_zh,evidence:analysis.key_evidence_zh||[],pricing:analysis.market_pricing_zh||undefined,variant:analysis.variant_view_zh||undefined,catalysts:analysis.catalysts_zh||undefined,actions:analysis.levels_and_actions_zh||undefined,portfolioImplication:task.portfolio_implications_zh||undefined,sourceUrls:analysis.source_ids.map((id)=>sources.get(id)?.url).filter((url):url is string=>Boolean(url))})}
    for(const event of task.upcoming_events||[]){const source=event.source_ids.map((id)=>sources.get(id)).find(Boolean);const key=`${event.event_at}|${event.title_zh}`;if(event.confirmation_status!=='confirmed'||!source||seenEvents.has(key))continue;seenEvents.add(key);events.push({id:`report-event-${payload.run_context.run_id}-${events.length}`,date:event.event_at.slice(0,10),type:'宏观',category:'宏观信息',title:event.title_zh,note:event.why_it_matters_zh,sourceUrl:source.url,filterReason:`已确认事件；来源：${source.publisher}`,aiAdvice:task.portfolio_implications_zh||'现有证据不足以形成可靠建议',evidenceGap:task.portfolio_implications_zh?undefined:'待补数据'})}
    for(const item of task.macro_observations||[]){const source=item.source_ids.map((id)=>sources.get(id)).find(Boolean);if(!source)continue;events.push({id:`report-macro-${payload.run_context.run_id}-${item.metric_id}`,date:item.period.slice(0,10),type:'宏观',category:macroCategory(item.metric_id),title:`${item.label} · ${formatMetric(item)}`,note:task.market_regime_zh,sourceUrl:source.url,filterReason:`已核验观测；来源：${source.publisher}；数据期 ${item.period}`,aiAdvice:task.portfolio_implications_zh||'现有证据不足以形成可靠建议',evidenceGap:task.portfolio_implications_zh?undefined:'待补数据'})}
    const candidates:NewsCandidate[]=[...(task.section_news||[]),...(task.instruments||[]).flatMap((instrument)=>(instrument.news||[]).map((item)=>({...item,instrument_id:instrument.instrument_id,symbol:instrument.symbol})))]
    for(const item of candidates){const source=item.source_ids.map((id)=>sources.get(id)).find(Boolean);const key=`${item.published_at}|${item.headline}`;if(item.outside_window||!source||seenNews.has(key))continue;seenNews.add(key);const analysis=item.instrument_id?analyses.get(item.instrument_id):undefined;news.push({id:`report-news-${payload.run_context.run_id}-${news.length}`,ticker:item.symbol||task.title_zh,title:item.headline,summary:item.summary_zh,source:source.publisher,url:source.url,kind:/SEC|10-[KQ]|8-K|监管文件/i.test(item.headline+source.provider)?'SEC披露':'重大新闻',sentiment:sentiment(item.impact),filterReason:item.rationale_zh,aiAdvice:analysis?[analysis.investment_view_zh,analysis.levels_and_actions_zh].filter(Boolean).join(' '):(task.portfolio_implications_zh||undefined),ts:new Date(item.published_at).getTime()})}
  }
  return {events,news,decisions}
}

const eventPlaybook=(title:string)=>{
  if(/CPI|PPI|PCE|消费者价格|生产者价格|个人收入与支出/.test(title))return '发布后先比较实际值与市场一致预期，并区分核心通胀与总量贡献；上行意外先观察美债收益率和美元是否同步走强，再评估成长股估值压力，低于预期则反向验证。价格未确认前不因单一数据追涨杀跌。'
  if(/非农|就业|职位空缺|JOLTS/.test(title))return '核心观察就业增量、失业率与工资或职位空缺是否同向；数据偏强需验证利率路径是否重新定价，偏弱则区分温和降温与衰退信号。以美债收益率、美元和股指第一小时反应作为交易确认。'
  if(/GDP/.test(title))return '重点拆分增长来源与企业利润，而不是只看总量；增长上修且通胀压力可控偏向风险资产，增长下修并伴随利润走弱则提高防御。等待利率与周期资产给出同向确认后再调整仓位。'
  if(/贸易/.test(title))return '观察出口、进口与贸易差额变化所反映的内需和外需强弱，并通过美元及周期资产验证。单月波动不足以改变中期判断，需与制造业、消费和企业盈利证据交叉确认。'
  return '发布后以实际值相对一致预期的偏差为第一判断变量，先观察利率、美元与股指是否形成一致反应，再评估持仓影响；没有跨市场确认时维持原仓位。'
}

export function adaptMonthlyCalendar(payload:MonthlyCalendarPayload,context:MacroDecisionContext={}):CatalystEvent[]{
  return payload.events.map((item)=>{const backdrop=[context.marketRegime,context.portfolioImplication].filter(Boolean).join(' ');return {id:`calendar-${item.id}`,date:item.event_at.slice(0,10),type:'宏观',category:'宏观信息',title:item.title_zh,note:`香港时间 ${item.event_at.slice(11,16)}；原始时间 ${item.original_time_label}`,sourceUrl:item.source_url,filterReason:`本月重要官方发布；来源：${item.publisher}`,aiAdvice:[backdrop&&`当前背景：${backdrop}`,`事件前方案：${eventPlaybook(item.title_zh)}`].filter(Boolean).join(' ')}})
}
