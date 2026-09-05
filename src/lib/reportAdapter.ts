import type { CatalystCategory, CatalystEvent, NewsItem, PMDecision } from '@/types'

type Source = { source_id:string; provider:string; publisher:string; url:string; published_at?:string; retrieved_at:string }
type ReportNews = { headline:string; published_at:string; summary_zh:string; impact:'positive'|'negative'|'neutral'; rationale_zh:string; source_ids:string[]; outside_window:boolean }
type Analysis = { instrument_id:string; investment_view_zh:string; key_evidence_zh?:string[]; market_pricing_zh?:string; variant_view_zh?:string; catalysts_zh?:string; levels_and_actions_zh?:string; source_ids:string[] }
type NewsCandidate = ReportNews & { instrument_id?:string; symbol?:string }
type MacroObservation = { metric_id:string; label:string; value:string|number; unit:string; period:string; actual?:string|number; consensus?:string|number; prior?:string|number; source_ids:string[] }
type Price = { kind:string; value:string|number; change_pct?:string|number|null; as_of:string; source_ids:string[] }
type MarketObservation = { metric_id:string; instrument_id:string; label:string; value:string|number; unit:string; as_of:string; source_ids:string[] }
type Instrument = { instrument_id:string; symbol:string; news:ReportNews[]; prices?:Price[] }
type Task = { task_id:string; title_zh:string; market_regime_zh?:string; portfolio_implications_zh?:string; instruments:Instrument[]; section_news:ReportNews[]; upcoming_events:Array<{event_at:string;confirmation_status:string;title_zh:string;why_it_matters_zh:string;transmission_variable_zh?:string;source_ids:string[]}>; macro_observations?:MacroObservation[]; market_observations?:MarketObservation[]; investment_analyses:Analysis[]; sources:Source[] }
export type ReportPayload = { run_context:{run_id:string;scheduled_for:string};tasks:Task[] }
export type MonthlyCalendarPayload = { generated_at:string; timezone:string; month:string; events:Array<{id:string;title_zh:string;event_at:string;original_timezone:string;original_time_label:string;all_day?:boolean;publisher:string;source_url:string;importance?:'high';importance_publisher?:string;importance_source_url?:string;actual?:string;consensus?:string;previous?:string;result_summary_zh?:string;market_impact_zh?:string;result_publisher?:string;result_source_url?:string}> }
export type MacroDecisionContext = { marketRegime?:string; portfolioImplication?:string }

const sentiment=(impact:ReportNews['impact']):NewsItem['sentiment']=>impact==='positive'?'利好':impact==='negative'?'风险':'中性'
const macroCategory=(metricId:string):CatalystCategory=>metricId==='vixcls'?'市场估值与潜在风险':/dff|dgs10|dtwexbgs|fomc/.test(metricId)?'资金流向与资金成本':'宏观信息'
const formatMetric=(item:MacroObservation)=>item.unit==='date_range'?String(item.value):`${item.value}${item.unit==='index'?'':` ${item.unit}`}`
const readerText=(value:string|undefined)=>value?.replace(/(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g,'$1')
const numeric=(value:string|number|undefined|null)=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:undefined}

function fallbackDecision(payload:ReportPayload,task:Task,instrument:Instrument,sources:Map<string,Source>):PMDecision|undefined{
  const close=instrument.prices?.find((item)=>item.kind==='close');const price=numeric(close?.value)
  if(!close||price===undefined)return undefined
  const observations=(task.market_observations||[]).filter((item)=>item.instrument_id===instrument.instrument_id)
  const metric=(suffix:string)=>numeric(observations.find((item)=>item.metric_id.endsWith(suffix))?.value)
  const high=metric('30d_high');const low=metric('30d_low');const sma200=metric('sma_200d');const support1=metric('structural_support_1');const support2=metric('structural_support_2');const resistance1=metric('structural_resistance_1');const resistance2=metric('structural_resistance_2');const volume=metric('volume_vs_20d')
  const rangePosition=high!==undefined&&low!==undefined&&high>low?(price-low)/(high-low):undefined
  const trend=sma200!==undefined?`较200日均线${price>=sma200?'高':'低'}${Math.abs((price/sma200-1)*100).toFixed(1)}%`:undefined
  const location=rangePosition!==undefined?`处于近30日价格区间约${Math.round(rangePosition*100)}%分位`:undefined
  const sourceIds=[...(close.source_ids||[]),...observations.flatMap((item)=>item.source_ids||[])];const sourceUrls=[...new Set(sourceIds.map((id)=>sources.get(id)?.url).filter((url):url is string=>Boolean(url)))]
  return {id:`decision-fallback-${payload.run_context.run_id}-${task.task_id}-${instrument.instrument_id}`,taskId:task.task_id,ticker:instrument.symbol,view:`完整公司分析缺席，当前仅作价格与仓位风险复核。${instrument.symbol}最新核验收盘为${price.toFixed(2)}${trend?`，${trend}`:''}${location?`，${location}`:''}。价格已处于较高基准后，决策重点应从“公司是否增长”切换为“业绩能否超过已经抬高的市场预期”。`,evidence:[high!==undefined&&low!==undefined?`近30日收盘区间 ${low.toFixed(2)}–${high.toFixed(2)}`:'',volume!==undefined?`当日成交量为20日均量的${volume.toFixed(2)}倍`:''].filter(Boolean),pricing:'股价大涨不等于论点错误，但会压缩容错空间；即使财报同比增长，只要指引、毛利率或资本回报低于市场隐含预期，仍可能出现利好兑现。',variant:'继续上行需要盈利与指引上修消化估值；反面情景并非只有“财报不及预期”，还包括业绩符合预期但指引未再上修、回购规模或节奏弱于预期，以及放量跌破趋势支撑。',catalysts:'财报与回购是验证节点，不应单独充当投资论点；需要同时观察收入/盈利指引、毛利率、存储价格与供需、资本开支和回购执行。',actions:`不在财报前因上涨追高。${resistance1!==undefined?`上方先观察 ${resistance1.toFixed(2)}${resistance2!==undefined?`–${resistance2.toFixed(2)}`:''} 是否放量突破；`:''}${support1!==undefined?`下方以 ${support2!==undefined?`${support2.toFixed(2)}–`:''}${support1.toFixed(2)} 为首个风险控制区，`:''}若财报后指引未上修或价格放量失守支撑，应先降低仓位，而不是等到“报不及预期”才处理。`,portfolioImplication:readerText(task.portfolio_implications_zh),sourceUrls}
}

export function adaptReport(payload:ReportPayload):{events:CatalystEvent[];news:NewsItem[];decisions:PMDecision[]}{
  const events:CatalystEvent[]=[];const news:NewsItem[]=[];const decisions:PMDecision[]=[];const seenEvents=new Set<string>();const seenNews=new Set<string>()
  for(const task of payload.tasks){
    const sources=new Map(task.sources.map((source)=>[source.source_id,source]));const analyses=new Map(task.investment_analyses.map((item)=>[item.instrument_id,item]))
    for(const analysis of task.investment_analyses||[]){const instrument=task.instruments.find((item)=>item.instrument_id===analysis.instrument_id);if(!instrument)continue;decisions.push({id:`decision-${payload.run_context.run_id}-${task.task_id}-${analysis.instrument_id}`,taskId:task.task_id,ticker:instrument.symbol,view:readerText(analysis.investment_view_zh)||'',evidence:(analysis.key_evidence_zh||[]).map((item)=>readerText(item)||''),pricing:readerText(analysis.market_pricing_zh),variant:readerText(analysis.variant_view_zh),catalysts:readerText(analysis.catalysts_zh),actions:readerText(analysis.levels_and_actions_zh),portfolioImplication:readerText(task.portfolio_implications_zh),sourceUrls:analysis.source_ids.map((id)=>sources.get(id)?.url).filter((url):url is string=>Boolean(url))})}
    for(const instrument of task.instruments||[]){if(analyses.has(instrument.instrument_id))continue;const fallback=fallbackDecision(payload,task,instrument,sources);if(fallback)decisions.push(fallback)}
    for(const event of task.upcoming_events||[]){const source=event.source_ids.map((id)=>sources.get(id)).find(Boolean);const key=`${event.event_at}|${event.title_zh}`;if(event.confirmation_status!=='confirmed'||!source||seenEvents.has(key))continue;seenEvents.add(key);events.push({id:`report-event-${payload.run_context.run_id}-${events.length}`,date:event.event_at.slice(0,10),type:'宏观',category:'宏观信息',title:event.title_zh,note:readerText(event.why_it_matters_zh),sourceUrl:source.url,filterReason:`已确认事件；来源：${source.publisher}`,aiAdvice:readerText(task.portfolio_implications_zh)||'现有证据不足以形成可靠建议',evidenceGap:task.portfolio_implications_zh?undefined:'待补数据'})}
    for(const item of task.macro_observations||[]){const source=item.source_ids.map((id)=>sources.get(id)).find(Boolean);if(!source)continue;events.push({id:`report-macro-${payload.run_context.run_id}-${item.metric_id}`,date:item.period.slice(0,10),type:'宏观',category:macroCategory(item.metric_id),title:`${item.label} · ${formatMetric(item)}`,note:readerText(task.market_regime_zh),sourceUrl:source.url,filterReason:`已核验观测；来源：${source.publisher}；数据期 ${item.period}`,aiAdvice:readerText(task.portfolio_implications_zh)||'现有证据不足以形成可靠建议',evidenceGap:task.portfolio_implications_zh?undefined:'待补数据'})}
    const candidates:NewsCandidate[]=[...(task.section_news||[]),...(task.instruments||[]).flatMap((instrument)=>(instrument.news||[]).map((item)=>({...item,instrument_id:instrument.instrument_id,symbol:instrument.symbol})))]
    for(const item of candidates){const source=item.source_ids.map((id)=>sources.get(id)).find(Boolean);const key=`${item.published_at}|${item.headline}`;if(item.outside_window||!source||seenNews.has(key))continue;seenNews.add(key);const analysis=item.instrument_id?analyses.get(item.instrument_id):undefined;news.push({id:`report-news-${payload.run_context.run_id}-${news.length}`,ticker:item.symbol||task.title_zh,title:item.headline,summary:readerText(item.summary_zh),source:source.publisher,url:source.url,kind:/SEC|10-[KQ]|8-K|监管文件/i.test(item.headline+source.provider)?'SEC披露':'重大新闻',sentiment:sentiment(item.impact),filterReason:readerText(item.rationale_zh)||item.rationale_zh,aiAdvice:readerText(analysis?[analysis.investment_view_zh,analysis.levels_and_actions_zh].filter(Boolean).join(' '):(task.portfolio_implications_zh||undefined)),ts:new Date(item.published_at).getTime()})}
  }
  return {events,news,decisions}
}

const eventPlaybook=(title:string)=>{
  if(/FOMC|美联储|利率决议/.test(title))return '决策点依次看政策利率、声明措辞和经济预测，再观察主席发布会是否改变利率路径。先用2年期与10年期美债、美元和成长股的同向反应确认定价变化；若只有短时波动而利率预期未变，不调整核心仓位。'
  if(/CPI|PPI|PCE|消费者价格|生产者价格|个人收入与支出/.test(title))return '发布后先比较实际值与市场一致预期，并区分核心通胀与总量贡献；上行意外先观察美债收益率和美元是否同步走强，再评估成长股估值压力，低于预期则反向验证。价格未确认前不因单一数据追涨杀跌。'
  if(/非农|就业|职位空缺|JOLTS/.test(title))return '核心观察就业增量、失业率与工资或职位空缺是否同向；数据偏强需验证利率路径是否重新定价，偏弱则区分温和降温与衰退信号。以美债收益率、美元和股指第一小时反应作为交易确认。'
  if(/GDP/.test(title))return '重点拆分增长来源与企业利润，而不是只看总量；增长上修且通胀压力可控偏向风险资产，增长下修并伴随利润走弱则提高防御。等待利率与周期资产给出同向确认后再调整仓位。'
  if(/贸易/.test(title))return '观察出口、进口与贸易差额变化所反映的内需和外需强弱，并通过美元及周期资产验证。单月波动不足以改变中期判断，需与制造业、消费和企业盈利证据交叉确认。'
  return '发布后以实际值相对一致预期的偏差为第一判断变量，先观察利率、美元与股指是否形成一致反应，再评估持仓影响；没有跨市场确认时维持原仓位。'
}

export function adaptMonthlyCalendar(payload:MonthlyCalendarPayload,context:MacroDecisionContext={}):CatalystEvent[]{
  return payload.events.map((item)=>{const backdrop=readerText([context.marketRegime,context.portfolioImplication].filter(Boolean).join(' '));const review=item.result_summary_zh?[`结果：${item.result_summary_zh}`,item.market_impact_zh&&`市场传导：${item.market_impact_zh}`].filter(Boolean).join(' '):'';return {id:`calendar-${item.id}`,date:item.event_at.slice(0,10),type:'宏观',category:'宏观信息',title:item.title_zh,note:item.all_day?`官方日期 ${item.original_time_label}`:`香港时间 ${item.event_at.slice(11,16)}；原始时间 ${item.original_time_label}`,sourceUrl:item.source_url,filterReason:`本月事件；日期来源：${item.publisher}；重要性：${item.importance==='high'?'Investing.com 高影响框架':'一般关注'}${item.result_publisher?`；结果来源：${item.result_publisher}`:''}`,importance:item.importance,importanceSourceUrl:item.importance_source_url,actual:item.actual,consensus:item.consensus,previous:item.previous,resultSummary:item.result_summary_zh,marketImpact:item.market_impact_zh,resultSourceUrl:item.result_source_url,aiAdvice:review||[backdrop&&`当前背景：${backdrop}`,`事件前方案：${eventPlaybook(item.title_zh)}`].filter(Boolean).join(' ')}})
}
