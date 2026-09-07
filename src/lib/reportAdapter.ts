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
const formatMetric=(item:MacroObservation)=>item.unit==='date_range'?String(item.value):`${item.value}${item.unit==='index'?'':` ${item.unit}`}`
const readerText=(value:string|undefined)=>value?.replace(/(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g,'$1')
const numeric=(value:string|number|undefined|null)=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:undefined}

type MetricProfile = { category:CatalystCategory; note:string; reason:string; advice:string; evidenceGap?:string }
const metricProfile=(item:MacroObservation):MetricProfile|null=>{
  if(item.metric_id==='next_fomc_meeting'||/_(?:daily_change)$/.test(item.metric_id))return null
  if(item.metric_id==='dff')return {category:'资金流向与资金成本',note:'联邦基金有效利率是美元短端融资成本的政策锚，不代表资金实际流入或流出。',reason:'资金成本指标；来源可核验，但当前缺少前值变化',advice:'用它确认短端资金价格，再结合2年期美债与流动性数据判断条件是收紧还是放松。当前只有单点值，不据此调整仓位。',evidenceGap:'待补前值、2年期美债及流动性变化'}
  if(item.metric_id==='dgs10')return {category:'资金流向与资金成本',note:'10年期美债收益率是长期无风险利率与成长资产折现率的重要输入，不是资金流量。',reason:'长期资金成本指标；来源可核验，但当前缺少日/周变化',advice:'重点观察收益率方向与实际利率、美元是否同向。收益率上行通常提高久期资产估值压力，但必须用变化幅度和跨市场反应确认。',evidenceGap:'待补日变化、实际利率与期限利差'}
  if(item.metric_id==='dtwexbgs')return {category:'资金流向与资金成本',note:'广义美元指数用于观察全球美元金融条件，不能直接当作股票或ETF资金流。',reason:'美元流动性条件代理；不是直接资金流数据',advice:'美元走强且美债收益率同步上行时，通常意味着全球风险资产面临更紧金融条件；当前数据期较滞后且无变化值，只作背景观察。',evidenceGap:'待补最新变化、ETF流量与基金仓位数据'}
  if(item.metric_id==='vixcls')return {category:'市场估值与潜在风险',note:'VIX反映标普500期权隐含波动率和对冲价格，属于风险定价，不是股票估值倍数。',reason:'潜在风险指标；当前缺少历史分位与期限结构',advice:'只有当VIX的水平变化、期限结构及信用利差相互确认时，才升级尾部风险判断。单点VIX不能证明市场低估或高估风险。',evidenceGap:'待补历史分位、VIX期限结构、信用利差与估值倍数'}
  return {category:'宏观信息',note:'已核验的宏观观测。',reason:'宏观数据观测',advice:'结合前值、预期差与利率、美元、股指的同步反应判断持仓影响；单点读数不直接触发交易。'}
}

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
    for(const item of task.macro_observations||[]){const source=item.source_ids.map((id)=>sources.get(id)).find(Boolean);const profile=metricProfile(item);if(!source||!profile)continue;events.push({id:`report-macro-${payload.run_context.run_id}-${item.metric_id}`,date:item.period.slice(0,10),type:'宏观',category:profile.category,title:`${item.label} · ${formatMetric(item)}`,note:profile.note,sourceUrl:source.url,filterReason:`${profile.reason}；来源：${source.publisher}；数据期 ${item.period}`,aiAdvice:profile.advice,evidenceGap:profile.evidenceGap})}
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
  return payload.events.map((item)=>{const backdrop=readerText([context.marketRegime,context.portfolioImplication].filter(Boolean).join(' '));const review=item.result_summary_zh?[`结果：${item.result_summary_zh}`,item.market_impact_zh&&`市场传导：${item.market_impact_zh}`].filter(Boolean).join(' '):'';return {id:`calendar-${item.id}`,date:item.event_at.slice(0,10),type:'宏观',category:'宏观信息',title:item.title_zh,note:item.all_day?`官方日期 ${item.original_time_label}`:`香港时间 ${item.event_at.slice(11,16)}；原始时间 ${item.original_time_label}`,sourceUrl:item.source_url,filterReason:`核心宏观过滤通过；日期来源：${item.publisher}；重要性：参照 Investing.com 高影响类别${item.result_publisher?`；结果来源：${item.result_publisher}`:''}`,importance:item.importance,importanceSourceUrl:item.importance_source_url,actual:item.actual,consensus:item.consensus,previous:item.previous,resultSummary:item.result_summary_zh,marketImpact:item.market_impact_zh,resultSourceUrl:item.result_source_url,aiAdvice:review||[backdrop&&`当前背景：${backdrop}`,`事件前方案：${eventPlaybook(item.title_zh)}`].filter(Boolean).join(' ')}})
}
