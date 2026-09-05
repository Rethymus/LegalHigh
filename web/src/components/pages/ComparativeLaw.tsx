// 跨法域对比只展示已进入本地证据语料/案例库的可核验材料。
// 不提供任意主题输入，也不把静态项目文字标成 AI 分析。
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../icons'
import { EmptyState, PageHeader, SkeletonLines } from '../ui'
import { ForeignDisclaimer, OfficialArticle, SourceBadge } from '../domain'
import { findArticle, findLaw, lawEvidenceGrade, useLaws } from '../../data/model'
import { api, ApiError, type CaseRecord } from '../../lib/api'

export default function ComparativeLaw() {
  const { data: laws, error: lawsError } = useLaws()
  const [foreignCase, setForeignCase] = useState<CaseRecord | null>(null)
  const [caseError, setCaseError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api.getCase('donoghue-v-stevenson').then(
      (value) => { if (alive) setForeignCase(value) },
      (error) => { if (alive) setCaseError(error instanceof ApiError ? error.message : String(error)) },
    )
    return () => { alive = false }
  }, [])

  const civilCode = findLaw(laws, 'civl-2020')
  const article1165 = findArticle(civilCode, 1165)
  const error = lawsError ?? caseError

  return (
    <div className="page">
      <PageHeader
        title="跨法域对比"
        sub="当前只开放一组已核验材料：以《民法典》第1165条与 Donoghue v Stevenson 的注意义务说理作方法论对照。"
      />

      <div className="mb-16"><ForeignDisclaimer /></div>
      <div className="banner banner-info mb-16">
        <Icon name="info" size={15} />
        <span className="banner-tx">本页不主张两套规则等同，也不把外国判例作为中国案件的证据或裁判依据。中间栏是项目编写的方法提示，不是模型生成结论。</span>
      </div>

      {error && <div className="banner banner-danger mb-16"><Icon name="alert" size={15} />{error}</div>}
      {!error && (!laws || !foreignCase) && <div className="card card-pad"><SkeletonLines n={6} tall /></div>}

      {!error && laws && foreignCase && civilCode && article1165 ? (
        <div className="cols cols-3">
          <section className="card">
            <div className="card-h">
              <div><b className="card-h-t">中国制定法</b><small className="tiny" style={{ display: 'block' }}>中华人民共和国民法典</small></div>
              <span className="spacer" /><SourceBadge kind="law" grade={lawEvidenceGrade(civilCode.sourceUrl)} />
            </div>
            <div className="card-b" style={{ paddingTop: 10 }}>
              <OfficialArticle law={civilCode} article={article1165} dense />
              <div className="tiny mt-12">证据等级随本地法规快照来源显示；正式使用前仍须回到现行官方文本复核。</div>
              <Link to="/laws/civl-2020?art=1165" className="btn btn-secondary btn-sm mt-12">查看本地法条详情</Link>
            </div>
          </section>

          <section className="card">
            <div className="card-h"><b className="card-h-t">可比性边界（项目整理）</b></div>
            <div className="card-b" style={{ paddingTop: 10 }}>
              <ol className="tiny" style={{ lineHeight: 2, paddingLeft: 4, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <li>1. 可比较的是“过错侵权的一般规则”与“注意义务说理”如何组织论证，不是法源效力。</li>
                <li>2. 《民法典》第1165条是中国制定法；Donoghue 是英国历史判例，适用制度、程序和事实背景均不同。</li>
                <li>3. 外国判决中的邻人原则可作为法学教育材料，但不能替代中国法上的请求权基础、构成要件与证据审查。</li>
                <li>4. 具体案件仍须核对现行中国法律、司法解释及有权机关发布材料，并由专业人员判断。</li>
              </ol>
            </div>
          </section>

          <section className="card">
            <div className="card-h">
              <div><b className="card-h-t">英国判例</b><small className="tiny" style={{ display: 'block' }}>{foreignCase.no}</small></div>
              <span className="spacer" /><SourceBadge kind="foreign" grade={foreignCase.grade} />
            </div>
            <div className="card-b" style={{ paddingTop: 10 }}>
              <h3 style={{ fontSize: 16, margin: '0 0 8px' }}>{foreignCase.name_en ?? foreignCase.name}</h3>
              <div className="tiny mb-12">{foreignCase.court} · {foreignCase.date}</div>
              <div className="src-item">
                <div className="src-item-t">项目结构化摘要</div>
                <div className="src-item-q">{foreignCase.summary}</div>
              </div>
              <div className="tiny mt-12">来源：{foreignCase.source_title}；核验于 {foreignCase.source_accessed_at}。</div>
              <div className="row-wrap mt-12" style={{ gap: 8 }}>
                <a href={foreignCase.source_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm"><Icon name="external" size={12} />打开判决文本</a>
                <Link to={`/cases/${foreignCase.id}`} className="btn btn-ghost btn-sm">查看结构化摘要</Link>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {!error && laws && (!civilCode || !article1165) && (
        <EmptyState icon="alert" title="对照法条未进入证据语料" desc="为避免手写或猜测法条，本页已停止展示该对比。" />
      )}
    </div>
  )
}
