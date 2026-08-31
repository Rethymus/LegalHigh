// 演示模式 API（GitHub Pages 静态预览专用，决策：代码托管/Pages 执行件）
// 机制：拦截同源 /api/* 请求，在浏览器内复刻 server 的确定性逻辑（BM25 检索 /
// 前提纠错 / 需求解析），写入类端点诚实返回 501 引导桌面端/本地部署。
// 纪律：演示模式只读快照数据（laws/cases/evals 均来自证据管线），不虚构任何功能。
import { BM25Okapi, tokenize } from './bm25'

const DEMO_NOTICE = 'GitHub Pages 预览模式：此功能需下载数据快照或本地运行后端（uvicorn）使用。'

interface LawFile { builtAt: string; fetchDate: string; note: string; laws: LawRow[] }
interface LawRow { id: string; title: string; status: string; organ: string; promulgationDate: string; instrument: string; effectiveDate: string; sourceUrl: string; articles: { no: number; label: string; chapter: string; text: string }[] }
interface CaseRow { id: string; name: string; no: string; court: string; date: string; jurisdiction: string; cause: string; level: string; focus: string[]; summary: string; facts: string; holding: string; statutes: { law_id: string; no: number; label: string }[]; kind: string; grade: string; source_note: string; verified: boolean; sample?: boolean }

let bm25: BM25Okapi | null = null
let flat: { law_id: string; law_title: string; no: number; label: string; chapter: string; text: string; law: LawRow }[] = []
let lawsFile: LawFile | null = null
let cases: CaseRow[] = []
const loaded = fetch(import.meta.env.BASE_URL + 'data/laws.json').then((r) => r.json() as Promise<LawFile>)
const casesLoaded = fetch(import.meta.env.BASE_URL + 'data/cases.json').then((r) => r.json() as Promise<{ cases: CaseRow[] }>)
const evalsLoaded = fetch(import.meta.env.BASE_URL + 'data/evals.json').then((r) => r.json()).catch(() => null)

async function ensureIndex() {
  if (bm25) return
  lawsFile = await loaded
  flat = []
  for (const law of lawsFile!.laws) {
    for (const a of law.articles) {
      flat.push({ law_id: law.id, law_title: law.title, no: a.no, label: a.label, chapter: a.chapter, text: a.text, law })
    }
  }
  bm25 = new BM25Okapi(flat.map((f) => tokenize(f.label + '\n' + (f.chapter || '') + '\n' + f.text)))
}

function searchArticles(q: string, topK: number) {
  if (!bm25) return []
  const hits = bm25.scores(q)
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((h) => ({ ...flat[h.idx], score: h.score }))
  const seen = new Set<string>()
  return hits.filter((h) => {
    const k = `${h.law_id}#${h.no}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// —— qa premise 规则（与 server/app/qa.py 同步维护）——
const PREMISE: { id: string; re: RegExp; warning: string; law_id: string; article_no: number; label: string }[] = [
  { id: 'pr-7day', re: /(三十|30)\s*日?无理由退货/, warning: '「三十日无理由退货」这一前提不正确：网络等远程购物适用的是七日无理由退货。', law_id: 'cl-2013', article_no: 25, label: '第二十五条' },
  { id: 'pr-probation-12m', re: /试用[期]?[^。？?]{0,12}(一年|十二个月|12个月)/, warning: '「试用期一年」这一前提不正确：三年以上固定期限和无固定期限劳动合同，试用期上限为六个月。', law_id: 'lcl-2012', article_no: 19, label: '第十九条' },
  { id: 'pr-probation-1y-cap', re: /试用期[^。？?]{0,20}(不得超过一年|最长一年)/, warning: '「试用期上限一年」这一前提不正确：法律规定的试用期上限为六个月。', law_id: 'lcl-2012', article_no: 19, label: '第十九条' },
  { id: 'pr-deposit-triple', re: /(定金|订金)[^。？?]{0,16}(三倍|三倍返还|退一赔三)/, warning: '定金规则是「双倍返还」而非三倍：收受定金方违约致合同目的不能实现时应双倍返还；「退一赔三」是消费者欺诈惩罚性赔偿，二者不可混用。', law_id: 'civl-2020', article_no: 587, label: '第五百八十七条' },
  { id: 'pr-limitation-2y', re: /诉讼时效[^。？?]{0,10}(二年|2年|两年)/, warning: '「诉讼时效二年」这一前提不正确：向人民法院请求保护民事权利的普通诉讼时效期间为三年（2017 年 10 月起施行的民法典总则编即已改为三年，网络上大量旧文仍写两年）。', law_id: 'civl-2020', article_no: 188, label: '第一百八十八条' },
  { id: 'pr-id-seizure', re: /(扣押|扣留|收走)[^。？?]{0,8}(身份证|证件|毕业证)/, warning: '「扣押证件」不合法：用人单位招用劳动者不得扣押居民身份证和其他证件，也不得要求提供担保或收取财物。', law_id: 'lcl-2012', article_no: 9, label: '第九条' },
]

const DISCLAIMER = '本系统为法律信息检索工具，输出内容为法条原文与程序性信息，不构成法律意见，亦不建立委托关系。重大事项请咨询执业律师或拨打 12348 公共法律服务热线。'

function card(f: (typeof flat)[number]) {
  const law = f.law
  return {
    law_id: f.law_id, law_title: law.title, law_status: law.status, effective_date: law.effectiveDate || null,
    promulgation_instrument: law.instrument, article_no: f.no, article_label: f.label, chapter: f.chapter,
    text: f.text, source_url: law.sourceUrl, source_kind: '官方原文', score: 0,
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}

async function handle(method: string, path: string, body: unknown): Promise<Response> {
  await ensureIndex()
  const [pathname, query = ''] = path.split('?')
  const qs = new URLSearchParams(query)
  if (method === 'POST' && !['/api/qa/ask', '/api/needs/parse'].includes(pathname)) {
    return json({ detail: DEMO_NOTICE, demo: true }, 501)
  }
  if (pathname === '/api/health') return json({ status: 'ok (demo)', laws: lawsFile!.laws.length, articles: flat.length })
  if (pathname === '/api/laws') return json({ laws: lawsFile!.laws.map((l) => ({ law_id: l.id, title: l.title, status: l.status, organ: l.organ, promulgation_date: l.promulgationDate, effective_date: l.effectiveDate, article_count: l.articles.length })), fetched_at: lawsFile!.fetchDate, disclaimer: DISCLAIMER })
  if (pathname === '/api/search') {
    const q = qs.get('q') ?? ''
    const topK = Math.min(Number(qs.get('top_k') ?? 20), 60)
    const hits = searchArticles(q, topK)
    return json({ query: q, total: hits.length, hits: hits.map((h) => ({ law_id: h.law_id, law_title: h.law_title, no: h.no, label: h.label, chapter: h.chapter, text: h.text, score: h.score })), retrieval_meta: { method: 'bm25-char-bigram (demo)', corpus_size: flat.length } })
  }
  if (pathname === '/api/qa/ask') {
    const { question, top_k = 6 } = body as { question: string; top_k?: number }
    const premise = PREMISE.find((r) => r.re.test(question))
    const hits = searchArticles(question, top_k)
    const premise_check = premise && (() => {
      const f = flat.find((x) => x.law_id === premise.law_id && x.no === premise.article_no)
      return { rule_id: premise.id, warning: premise.warning, citation: { law_id: premise.law_id, law_title: f?.law_title ?? '', article_no: premise.article_no, article_label: premise.label } }
    })()
    return json({
      question, premise_check, answer_cards: hits.map(card),
      no_answer: hits.length === 0,
      no_answer_message: hits.length === 0 ? `在本库语料（当前收录 ${lawsFile!.laws.length} 部法律法规，共 ${flat.length.toLocaleString()} 条）中未检索到与该问题相关的依据。` : null,
      disclaimer: DISCLAIMER, retrieval_meta: { method: 'bm25-char-bigram (demo)', top_k, corpus_size: flat.length },
    })
  }
  if (pathname === '/api/needs/parse') {
    const { text } = body as { text: string }
    // 与 server/app/needs.py 域词表同步维护（演示子集）
    const TOPIC: [RegExp, string[]][] = [
      [/工资|欠薪|不发工资|劳动报酬|加班费/, ['劳动报酬', '劳动合同', '工资支付']],
      [/押金|租房|房东|承租|转租/, ['租赁合同', '押金', '出租人']],
      [/假货|退货|网购|欺诈|三无产品/, ['欺诈', '经营者', '退货、更换、修理']],
      [/违约金|违约|毁约/, ['违约金', '违约责任']],
      [/离婚|婚姻|抚养/, ['离婚', '抚养']],
      [/借款|借.{0,2}钱|借贷|欠钱/, ['借款合同', '借贷']],
      [/车祸|交通事故|撞/, ['交通事故']],
      [/格式条款|霸王条款/, ['格式条款']],
      [/竞业|竞业限制/, ['竞业限制']],
      [/歧视|区别对待|不公正对待/, ['平等就业']],
    ]
    const domain: string[] = []
    for (const [re, terms] of TOPIC) {
      if (re.test(text)) for (const t of terms) if (!domain.includes(t)) domain.push(t)
    }
    const kws = (domain.length ? domain : tokenize(text).slice(0, 8)).slice(0, 8)
    const evidence = searchArticles(kws[0] ?? text, 6)
    const arts = evidence.map((h) => {
      const cit = { law_id: h.law_id, law_title: h.law_title, article_no: h.no, article_label: h.label, text: h.text, status: h.law.status, effective_date: h.law.effectiveDate || '', chapter: h.chapter, score: h.score }
      return { ...cit, official_entry: 'https://flk.npc.gov.cn', official_entry_note: '国家法律法规数据库（官方核对入口，检索该法条目）', snapshot_url: h.law.sourceUrl }
    })
    return json({
      input: text,
      parse: { understood: `就『${text.slice(0, 60)}』在现行法规语料与案例样本中检索依据`, issue_type: '其他', assumed_causes: [], keywords: kws, keywords_display: domain.length ? domain : kws, cautions: ['演示模式：浏览器内词法检索复刻。'], by: 'deterministic (demo)' },
      ai_error: null,
      articles: arts, cases: [], articles_none: arts.length === 0, corpus_size: flat.length,
      disclaimer: '解析结果为检索线索（演示模式：证据来自本地语料），不构成法律意见；真实法律求助请咨询执业律师，经济困难可申请法律援助或拨打 12348。',
    })
  }
  if (pathname === '/api/cases') {
    cases = (await casesLoaded).cases
    const q = (qs.get('q') ?? '').trim().toLowerCase()
    const level = qs.get('level')
    let list = cases
    if (level) list = list.filter((c) => c.level === level)
    if (q) list = list.filter((c) => `${c.name}${c.cause}${c.summary}${c.no}${c.court}${c.focus.join('')}`.toLowerCase().includes(q))
    return json({ cases: list })
  }
  if (pathname === '/api/evals') {
    const e = await evalsLoaded
    if (!e) return json({ detail: DEMO_NOTICE, demo: true }, 501)
    return json(e)
  }
  const m = pathname.match(/^\/api\/laws\/([^/]+)\/explains$/)
  if (m) return json({ law_id: decodeURIComponent(m[1]), explains: {} })
  // 其余端点：预览模式诚实降级
  return json({ detail: DEMO_NOTICE, demo: true }, 501)
}

/** 安装演示 API：拦截同源 /api/* fetch（在应用启动前调用一次）。 */
export function installDemoApi() {
  const raw = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const origin = new URL(url, window.location.href)
    if (origin.origin === window.location.origin && origin.pathname.startsWith('/api/')) {
      let body: unknown = null
      if (init?.body && typeof init.body === 'string') {
        try { body = JSON.parse(init.body) } catch { body = null }
      }
      return handle(init?.method ?? 'GET', origin.pathname + origin.search, body)
    }
    return raw(input, init)
  }
}
