// 当前数据源清单：只展示系统实际加载、且能逐条回到证据 URL 的内容。
import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../icons'
import { lawEvidenceGrade, useLaws } from '../../data/model'
import { SourceBadge } from '../domain'
import { PageHeader, SkeletonLines, ValidityBadge } from '../ui'
import { api, type CaseRecord } from '../../lib/api'

function lawSourceLabel(sourceUrl: string): string {
  try {
    const host = new URL(sourceUrl).hostname.toLowerCase()
    return host === 'www.gov.cn' || host.endsWith('.gov.cn')
      ? '中国政府网公开文本'
      : 'Wikisource 转录快照'
  } catch {
    return '来源地址待核'
  }
}

export default function DataSources() {
  const { data, error: lawsError } = useLaws()
  const [cases, setCases] = useState<CaseRecord[] | null>(null)
  const [casesError, setCasesError] = useState<string | null>(null)
  const [compliance, setCompliance] = useState<Awaited<ReturnType<typeof api.compliance>> | null>(null)

  useEffect(() => {
    let alive = true
    api.listCases().then(
      (result) => {
        if (!alive) return
        setCases(result.cases.filter((item) => item.verified && !item.sample))
        setCasesError(null)
      },
      (reason: unknown) => {
        if (!alive) return
        setCases(null)
        setCasesError(reason instanceof Error ? reason.message : String(reason))
      },
    )
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true
    api.compliance().then((c) => alive && setCompliance(c), () => { /* 合规声明加载失败不阻塞数据源展示 */ })
    return () => { alive = false }
  }, [])

  const articleCount = useMemo(
    () => data?.laws.reduce((sum, law) => sum + law.articles.length, 0) ?? 0,
    [data],
  )
  const pendingEffectiveDates = data?.laws.filter((law) => !law.effectiveDate).length ?? 0

  return (
    <div className="page">
      <PageHeader
        title="当前数据与证据来源"
        sub="这里只列出本次运行实际加载的资料；每部法律、每件案例都展示来源地址、核验日期或证据等级。"
      />

      <div className="banner banner-info mb-16">
        <Icon name="shieldCheck" size={15} />
        <span className="banner-tx">
          <b>口径：</b>“已加载”不等于“覆盖全部中国法律或案例”。Wikisource 是转录快照，不冒充国家法律法规数据库的权威现行版本；域外判例只用于比较研究。
        </span>
      </div>

      <div className="stats mb-20">
        <div className="stat"><b>{data ? data.laws.length : '—'}</b><span>已加载法律</span></div>
        <div className="stat"><b>{data ? articleCount.toLocaleString() : '—'}</b><span>已加载条文</span></div>
        <div className="stat"><b>{cases ? cases.length : '—'}</b><span>逐件核实案例</span></div>
      </div>

      <section className="card mb-20">
        <div className="card-h row-wrap">
          <span className="dsv-ic" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>
            <Icon name="article" size={17} />
          </span>
          <b className="card-h-t">法律证据快照</b>
          <span className="spacer" />
          {data && <span className="tiny">构建 {data.builtAt.slice(0, 10)} · 证据抓取 {data.fetchDate}</span>}
        </div>
        <div className="card-b">
          {lawsError && <div className="empty-sm">法律快照加载失败：{lawsError}</div>}
          {!data && !lawsError && <SkeletonLines n={4} tall />}
          {data && (
            <>
              {pendingEffectiveDates > 0 && (
                <div className="banner banner-warn mb-12">
                  <Icon name="alert" size={15} />
                  <span className="banner-tx">有 {pendingEffectiveDates} 部法律的生效日期字段仍待官方核对；系统不得据此作“当前有效版本已完整核验”的断言。</span>
                </div>
              )}
              <div className="list-divided">
                {data.laws.map((law) => (
                  <article key={law.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row-wrap mb-8">
                        <b>{law.title}</b>
                        <SourceBadge kind="law" grade={lawEvidenceGrade(law.sourceUrl)} />
                        <ValidityBadge v={law.status} />
                      </div>
                      <div className="tiny">
                        {law.organ || '制定机关待核'} · {law.articles.length.toLocaleString()} 条 ·
                        生效日期：{law.effectiveDate || '待官方核对'} · {lawSourceLabel(law.sourceUrl)}
                      </div>
                      {law.effectiveDateEvidence && (
                        <div className="tiny mt-8">
                          日期依据：<a href={law.effectiveDateEvidence.url} target="_blank" rel="noreferrer">{law.effectiveDateEvidence.title}</a>
                          {' '}· {law.effectiveDateEvidence.accessed_at} 查阅 ·【{law.effectiveDateEvidence.grade}】
                        </div>
                      )}
                      {law.authority && <div className="tiny mt-8">证据定位：{law.authority}</div>}
                    </div>
                    <a className="btn btn-sm" href={law.sourceUrl} target="_blank" rel="noreferrer">
                      <Icon name="external" size={13} />查看证据页
                    </a>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="card mb-20">
        <div className="card-h row-wrap">
          <span className="dsv-ic" style={{ background: 'var(--teal-soft)', color: 'var(--teal-t)' }}>
            <Icon name="gavel" size={17} />
          </span>
          <b className="card-h-t">已核实公开案例</b>
          <span className="spacer" />
          <span className="tiny">人工结构化；原始发布页仍是事实核对依据</span>
        </div>
        <div className="card-b">
          {casesError && <div className="empty-sm">案例服务不可用，当前无法读取清单：{casesError}</div>}
          {!cases && !casesError && <SkeletonLines n={3} tall />}
          {cases && cases.length === 0 && <div className="empty-sm">当前没有可公开展示且已核实的案例。</div>}
          {cases && cases.length > 0 && (
            <div className="list-divided">
              {cases.map((item) => (
                <article key={item.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row-wrap mb-8">
                      <b>{item.name}</b>
                      <SourceBadge kind={item.kind} grade={item.grade} />
                    </div>
                    <div className="tiny">{item.no} · {item.court} · {item.date} · {item.jurisdiction}</div>
                    <div className="tiny mt-8">来源：{item.source_title} · 查阅日期 {item.source_accessed_at}</div>
                  </div>
                  <a className="btn btn-sm" href={item.source_url} target="_blank" rel="noreferrer">
                    <Icon name="external" size={13} />查看原始来源
                  </a>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-h"><b className="card-h-t">当前明确未提供的能力</b></div>
        <div className="card-b">
          <ul className="plain-list">
            <li>没有连接国家法律法规数据库的实时接口，也没有完整的历史版本库。</li>
            <li>没有接入人民法院案例库、裁判文书网或任何批量裁判文书抓取通道。</li>
            <li>没有接入商业法律数据库、学术论文库、CAIL 个案库或通用域外案例 API。</li>
            <li>未获得明确许可的数据集不会进入正式语料；无许可证的 LawRefBook 副本已从项目中移除。</li>
          </ul>
          <div className="tiny mt-12">新增来源必须先完成授权、来源、抓取日期、证据等级、个人信息与删除机制核验，再进入构建流程。</div>
        </div>
      </section>

      {compliance && (
        <section className="card mt-20">
          <div className="card-h"><b className="card-h-t">平台定位与合规红线</b><span className="tiny">来自 /api/compliance（公开声明，供审计核查）</span></div>
          <div className="card-b">
            <p style={{ margin: 0, lineHeight: 1.9 }}>{compliance.positioning}</p>
            <div className="banner banner-info mt-12">
              <Icon name="info" size={15} />
              <span className="banner-tx"><b>模型状态：</b>{compliance.model_status.status}。{compliance.model_status.detail}</span>
            </div>
            <ul className="plain-list mt-12">
              {compliance.red_lines.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        </section>
      )}
    </div>
  )
}
