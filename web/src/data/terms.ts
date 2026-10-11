// 术语卡数据加载器（R508：数据即资产——terms.json 从 JS 打包迁移到
// public/data/ 运行时 fetch，与 laws.json/xrefs.json 同纪律）。
// 此前 215 张卡（132KB 原文/20KB gzip）被 4 个组件静态 import 进 JS 预算；
// 迁移后作为静态资源独立缓存，JS 总量下降且术语内容更新不再触发 chunk 重发。
// 单一来源：web/public/data/terms.json（llms.txt 生成器与 gate7 读同一路径）。

export interface TermRef {
  law_id: string
  art: string
  label: string
}

export interface TermCard {
  cat: string
  term: string
  explain: string
  refs: TermRef[]
}

let cache: TermCard[] | null = null
let pending: Promise<TermCard[]> | null = null

export function loadTerms(): Promise<TermCard[]> {
  if (cache) return Promise.resolve(cache)
  if (!pending) {
    pending = fetch('/data/terms.json')
      .then((r) => {
        if (!r.ok) throw new Error(`terms.json HTTP ${r.status}`)
        return r.json() as Promise<TermCard[]>
      })
      .then((d) => {
        cache = d
        return d
      })
      .catch((e) => {
        pending = null // 失败可重试；消费方以「未加载」态优雅降级
        throw e
      })
  }
  return pending
}
