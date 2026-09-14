// 流程图解（v6 S4-T3，2026-09-15）：民事诉讼与劳动仲裁的步骤化图解，纯静态内容页。
// 每一步的通俗说明都绑定受控语料内的真实条文（点击核对原文）——全部条号引用经程序
// 对语料逐一核验存在性后再接线（同术语卡证据纪律）。图解是简化示意，不是法律意见。
import { PageHeader } from '../ui'
import { Icon } from '../icons'
import { CitationChip } from '../domain'

interface Ref {
  law_id: string
  art: string
  label: string
}

interface Step {
  title: string
  explain: string
  refs: Ref[]
}

interface Guide {
  key: string
  title: string
  intro: string
  steps: Step[]
}

const GUIDES: Guide[] = [
  {
    key: 'civil',
    title: '民事诉讼流程（一审 · 普通程序）',
    intro: '以普通程序为口径的简化示意，帮助理解「官司从哪一步走到哪一步」；具体案件的程序以法院通知与现行法为准。',
    steps: [
      {
        title: '起诉',
        explain: '向有管辖权的法院递交起诉状。起诉需要符合法定条件：原告与本案有直接利害关系、有明确的被告、有具体的诉讼请求和事实理由、属于法院受理范围。',
        refs: [
          { law_id: 'pcl-2023', art: '122', label: '《民事诉讼法》第122条（起诉条件）' },
          { law_id: 'pcl-2023', art: '123', label: '第123条（起诉状）' },
        ],
      },
      {
        title: '立案受理',
        explain: '法院对符合起诉条件的必须受理：符合起诉条件的，七日内立案并通知当事人；不符合的，七日内作出不予受理的裁定。',
        refs: [{ law_id: 'pcl-2023', art: '126', label: '第126条（立案受理）' }],
      },
      {
        title: '答辩',
        explain: '法院应当在立案之日起五日内把起诉状副本发送被告；被告应当在收到之日起十五日内提出答辩状。',
        refs: [{ law_id: 'pcl-2023', art: '128', label: '第128条（答辩）' }],
      },
      {
        title: '开庭审理',
        explain: '法院审理民事案件应当在开庭三日前通知当事人和其他诉讼参与人；公开审理的，还会公告当事人姓名、案由和开庭的时间、地点。',
        refs: [{ law_id: 'pcl-2023', art: '139', label: '第139条（开庭通知）' }],
      },
      {
        title: '审理期限',
        explain: '适用普通程序审理的案件，应当在立案之日起六个月内审结；有特殊情况需要延长的，经批准可以延长。',
        refs: [{ law_id: 'pcl-2023', art: '152', label: '第152条（审理期限）' }],
      },
      {
        title: '判决与生效',
        explain: '超过上诉期没有上诉的判决（以及依法不准上诉的判决）是发生法律效力的判决，双方都应当按判决履行。',
        refs: [{ law_id: 'pcl-2023', art: '158', label: '第158条（生效判决）' }],
      },
      {
        title: '不服一审可上诉',
        explain: '当事人不服地方人民法院第一审判决的，有权在判决书送达之日起十五日内向上一级人民法院提起上诉。',
        refs: [{ law_id: 'pcl-2023', art: '171', label: '第171条（上诉）' }],
      },
      {
        title: '申请执行',
        explain: '发生法律效力的判决必须履行；一方拒绝履行的，对方当事人可以向人民法院申请执行。',
        refs: [{ law_id: 'pcl-2023', art: '247', label: '第247条（申请执行）' }],
      },
    ],
  },
  {
    key: 'labor',
    title: '劳动仲裁流程',
    intro: '劳动争议实行「先仲裁、后诉讼」，仲裁不收费；申请仲裁要注意一年的时效。',
    steps: [
      {
        title: '提出仲裁申请',
        explain: '向劳动争议仲裁委员会提交书面仲裁申请（按被申请人人数提交副本）。申请仲裁的时效期间为一年，从知道或应当知道权利被侵害之日起算。',
        refs: [
          { law_id: 'lcar-2007', art: '28', label: '《劳动争议调解仲裁法》第28条（仲裁申请）' },
          { law_id: 'lcar-2007', art: '27', label: '第27条（仲裁时效一年）' },
        ],
      },
      {
        title: '受理',
        explain: '仲裁委员会收到仲裁申请之日起五日内，认为符合受理条件的应当受理并通知申请人；不符合的书面通知申请人并说明理由。',
        refs: [{ law_id: 'lcar-2007', art: '29', label: '第29条（受理）' }],
      },
      {
        title: '开庭与裁决',
        explain: '仲裁庭裁决劳动争议案件，应当自受理仲裁申请之日起四十五日内结束；案情复杂需要延长的，经批准可以延期并书面通知当事人。',
        refs: [{ law_id: 'lcar-2007', art: '43', label: '第43条（裁决期限）' }],
      },
      {
        title: '一裁终局',
        explain: '追索劳动报酬、工伤医疗费、经济补偿或者赔偿金等不超过当地月最低工资标准十二个月金额的争议，仲裁裁决为终局裁决，自作出之日起发生法律效力。',
        refs: [{ law_id: 'lcar-2007', art: '47', label: '第47条（终局裁决）' }],
      },
      {
        title: '不服裁决可起诉',
        explain: '劳动者对终局裁决不服的，可以自收到仲裁裁决书之日起十五日内向人民法院提起诉讼。',
        refs: [{ law_id: 'lcar-2007', art: '48', label: '第48条（不服起诉）' }],
      },
      {
        title: '履行与强制执行',
        explain: '对发生法律效力的调解书、裁决书，当事人应当依照规定的期限履行；一方逾期不履行的，另一方可以向人民法院申请执行。',
        refs: [{ law_id: 'lcar-2007', art: '51', label: '第51条（履行与执行）' }],
      },
    ],
  },
]

export default function Process() {
  return (
    <div className="page">
      <PageHeader
        title="流程图解"
        sub="民事诉讼与劳动仲裁的步骤化图解。每一步的通俗说明都绑定受控语料内的真实条文，点击即可核对原文；图解为简化示意，不是法律意见。"
      />
      <div className="banner banner-warm mb-16">
        <Icon name="bulb" size={15} />
        <span className="banner-tx">流程说明仅作普法参考；具体案件的程序以法院、仲裁机构的通知与现行法为准，必要时请咨询执业律师或拨打 12348。</span>
      </div>
      {GUIDES.map((g) => (
        <section key={g.key} className="card mb-20" style={{ padding: 16 }}>
          <h2 className="bold" style={{ fontSize: 15, margin: '0 0 4px' }}>{g.title}</h2>
          <div className="tiny muted mb-12">{g.intro}</div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            {g.steps.map((s, i) => (
              <li key={s.title} className="card" style={{ padding: '10px 14px', background: 'var(--fill-1, transparent)' }}>
                <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <span
                    aria-hidden
                    style={{
                      flexShrink: 0, width: 24, height: 24, borderRadius: '50%', display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                      background: 'var(--accent-fill, var(--accent))', color: '#fff',
                    }}
                  >
                    {i + 1}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 13.5 }}>{s.title}</b>
                    <div className="tiny mt-8" style={{ lineHeight: 1.75 }}>{s.explain}</div>
                    <div className="row-wrap mt-8" style={{ gap: 6 }}>
                      {s.refs.map((r) => (
                        <CitationChip key={r.art} label={r.label} to={`/laws/${r.law_id}?art=${r.art}`} />
                      ))}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <div className="tiny" style={{ paddingBottom: 24 }}>
        流程图解为项目原创普法内容并逐条绑定语料条文，未采用任何 AI 未审核生成；条号引用已逐一对照受控语料核验。
      </div>
    </div>
  )
}
