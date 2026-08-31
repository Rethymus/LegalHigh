// 演示模式 BM25：与 server/lib rank_bm25 + tokenize 同算法的 JS 复刻。
// 参考：rank-bm25（Python）公开实现 + LegalHigh server/app/corpus.py tokenize。
// 说明：演示评分与 server 可能存在浮点级细微差异；正式使用以桌面端/本地后端为准。

export function tokenize(text: string): string[] {
  const tokens: string[] = []
  const clean = (text || '').replace(/\s+/g, '')
  for (const m of clean.matchAll(/[a-zA-Z0-9]+/g)) tokens.push(m[0].toLowerCase())
  const han = clean.replace(/[^\u4e00-\u9fff]/g, '')
  for (let i = 0; i < han.length - 1; i++) tokens.push(han.slice(i, i + 2))
  if (han.length === 1) tokens.push(han)
  return tokens
}

export interface Bm25Doc { tokens: string[]; len: number }

export class BM25Okapi {
  private docs: Bm25Doc[]
  private avgdl: number
  private idf: Map<string, number>
  private tf: Map<string, number>[]

  constructor(corpusTokens: string[][]) {
    this.docs = corpusTokens.map((t) => ({ tokens: t, len: t.length }))
    this.avgdl = this.docs.reduce((s, d) => s + d.len, 0) / Math.max(this.docs.length, 1)
    const df = new Map<string, number>()
    this.tf = this.docs.map(({ tokens }) => {
      const f = new Map<string, number>()
      for (const t of tokens) f.set(t, (f.get(t) ?? 0) + 1)
      for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1)
      return f
    })
    const N = this.docs.length
    this.idf = new Map()
    for (const [t, n] of df) {
      this.idf.set(t, Math.log(1 + (N - n + 0.5) / (n + 0.5)))
    }
  }

  /** 与 rank-bm25 一致：k1=1.5, b=0.75 */
  scores(query: string): { idx: number; score: number }[] {
    const q = tokenize(query)
    const out: { idx: number; score: number }[] = []
    const k1 = 1.5, b = 0.75
    for (let i = 0; i < this.docs.length; i++) {
      const f = this.tf[i]
      let score = 0
      for (const t of q) {
        const freq = f.get(t) ?? 0
        const idf = this.idf.get(t)
        if (!idf || !freq) continue
        score += idf * ((freq * (k1 + 1)) / (freq + k1 * (1 - b + b * (this.docs[i].len / this.avgdl))))
      }
      out.push({ idx: i, score: Math.round(score * 10000) / 10000 })
    }
    return out
  }
}
