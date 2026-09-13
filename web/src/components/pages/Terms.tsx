import { Link } from 'react-router-dom'
import { PageHeader } from '../ui'
import { Icon } from '../icons'

/* 术语卡（粉饰清单②，v5-S2 2026-09-14）：高频法律术语的通俗解释，全部为项目原创
   内容并绑定受控语料内的真实条文（点击可核对原文）——与解读库双轨纪律一致的诚实形态：
   通俗解释不是法律意见。所有条号引用经检索/金标验证存在且现行有效。 */

interface TermCard {
  term: string
  explain: string
  refs: { law_id: string; art: string; label: string }[]
  cat: '民事' | '劳动' | '刑事' | '程序' | '网络与数据' | '治安' | '宪法'
}

const TERMS: TermCard[] = [
  {
    cat: '民事',
    term: '诉讼时效',
    explain: '向法院请求保护民事权利一般有三年期间，从知道或应当知道权利受损及义务人之日起算。及时主张权利很重要。',
    refs: [{ law_id: 'civl-2020', art: '188', label: '《民法典》第188条' }],
  },
  {
    cat: '民事',
    term: '定金与订金',
    explain: '「定金」有担保性质，收定金一方违约要双倍返还；「订金」通常只是预付款。合同里一字之差，后果不同。',
    refs: [{ law_id: 'civl-2020', art: '586', label: '《民法典》第586条' }],
  },
  {
    cat: '民事',
    term: '居住权',
    explain: '可以在住宅上为他人设立居住权，让其长期稳定居住；居住权无偿设立为主，不得转让、继承。',
    refs: [{ law_id: 'civl-2020', art: '366', label: '《民法典》第366条' }],
  },
  {
    cat: '劳动',
    term: '试用期上限',
    explain: '劳动合同期限三个月以上不满一年的，试用期不得超过一个月；三年以上或无固定期限的，不得超过六个月。',
    refs: [{ law_id: 'lcl-2012', art: '19', label: '《劳动合同法》第19条' }],
  },
  {
    cat: '劳动',
    term: '仲裁前置',
    explain: '劳动争议要先申请劳动仲裁，对裁决不服才能起诉——「先仲裁、后诉讼」，不能直接去法院。',
    refs: [{ law_id: 'lcar-2007', art: '5', label: '《劳动争议调解仲裁法》第5条' }],
  },
  {
    cat: '劳动',
    term: '仲裁时效一年',
    explain: '申请劳动仲裁的时效为一年，从知道或应当知道权利被侵害之日起算；拖欠劳动报酬在职期间不受此限。',
    refs: [{ law_id: 'lcar-2007', art: '27', label: '《劳动争议调解仲裁法》第27条' }],
  },
  {
    cat: '刑事',
    term: '正当防卫',
    explain: '为使合法权益免受正在进行的不法侵害而制止侵害，造成损害的不负刑事责任；明显超限才需担责但应减轻。',
    refs: [{ law_id: 'cl-2023', art: '20', label: '《刑法》第20条' }],
  },
  {
    cat: '刑事',
    term: '自首',
    explain: '犯罪后自动投案、如实供述自己罪行的，是自首，可以从轻或减轻处罚；犯罪较轻的可以免除处罚。',
    refs: [{ law_id: 'cl-2023', art: '67', label: '《刑法》第67条' }],
  },
  {
    cat: '刑事',
    term: '缓刑',
    explain: '被判拘役或三年以下有期徒刑、符合犯罪情节较轻等条件的，可以宣告缓刑；特定人群应当宣告缓刑。',
    refs: [{ law_id: 'cl-2023', art: '72', label: '《刑法》第72条' }],
  },
  {
    cat: '刑事',
    term: '帮信罪',
    explain: '明知他人利用信息网络实施犯罪，仍提供支付结算等帮助（如出借银行卡给跑分团伙），情节严重的构成犯罪。',
    refs: [{ law_id: 'cl-2023', art: '287之一', label: '《刑法》第287条之一' }],
  },
  {
    cat: '程序',
    term: '首违不罚',
    explain: '初次违法且危害后果轻微并及时改正的，可以不予行政处罚；没有主观过错的不予行政处罚。',
    refs: [{ law_id: 'penal-2021', art: '33', label: '《行政处罚法》第33条' }],
  },
  {
    cat: '程序',
    term: '国家赔偿时效',
    explain: '请求国家赔偿的时效为两年，从知道或应当知道权益被侵犯之日起算；被羁押期间不计入。',
    refs: [{ law_id: 'scl-2012', art: '39', label: '《国家赔偿法》第39条' }],
  },
  {
    cat: '网络与数据',
    term: '网络实名制',
    explain: '办理网络接入、注册域名、使用即时通讯等服务时，运营者应要求提供真实身份信息；不提供不得服务。',
    refs: [{ law_id: 'csl-2025', art: '26', label: '《网络安全法》第26条' }],
  },
  {
    cat: '网络与数据',
    term: '数据分类分级',
    explain: '国家按数据的重要程度和遭破坏后的危害程度，对数据实行分类分级保护；重要数据处理者有定期风险评估义务。',
    refs: [{ law_id: 'dsl-2021', art: '21', label: '《数据安全法》第21条' }],
  },
  {
    cat: '网络与数据',
    term: '网络欺凌',
    explain: '任何人不得通过网络以文字、图片、音视频等形式对未成年人实施侮辱、诽谤等欺凌行为；可通知平台采取处置措施。',
    refs: [{ law_id: 'minor-2024', art: '77', label: '《未成年人保护法》第77条' }],
  },
  {
    cat: '网络与数据',
    term: '人身安全保护令',
    explain: '遭受或面临被纠缠、骚扰等现实危险的，可以向人民法院申请人身安全保护令；恋爱、分手后同样适用。',
    refs: [{ law_id: 'women-2022', art: '29', label: '《妇女权益保障法》第29条' }],
  },
  {
    cat: '治安',
    term: '询问查证时限',
    explain: '公安机关传唤后询问查证不得超过八小时；案情复杂可能适用行政拘留的，不得超过二十四小时。',
    refs: [{ law_id: 'psm-2025', art: '97', label: '《治安管理处罚法》第97条' }],
  },
  {
    cat: '治安',
    term: '当场处罚',
    explain: '当场作出治安处罚决定时，人民警察应当出示人民警察证、填写处罚决定书并当场交付被处罚人。',
    refs: [{ law_id: 'psm-2025', art: '120', label: '《治安管理处罚法》第120条' }],
  },
  {
    cat: '治安',
    term: '高空抛物',
    explain: '从建筑物或者其他高空抛掷物品，危害他人人身、财产安全或公共安全的，处五日以下拘留或者一千元以下罚款；情节严重的处十日以上十五日以下拘留。',
    refs: [{ law_id: 'psm-2025', art: '43', label: '《治安管理处罚法》第43条' }],
  },
  {
    cat: '程序',
    term: '行政处罚时效',
    explain: '违法行为二年内未被发现的不再给予行政处罚；涉及公民生命健康安全、金融安全且有危害后果的延长至五年。',
    refs: [{ law_id: 'penal-2021', art: '36', label: '《行政处罚法》第36条' }],
  },
  {
    cat: '刑事',
    term: '教唆犯罪',
    explain: '教唆他人犯罪的，按照其在共同犯罪中所起的作用处罚；教唆不满十八周岁的人犯罪的，应当从重处罚。',
    refs: [{ law_id: 'cl-2023', art: '29', label: '《刑法》第29条' }],
  },
  {
    cat: '民事',
    term: '性骚扰救济',
    explain: '禁止违背妇女意愿以言语、文字、图像、肢体等方式实施性骚扰；受害妇女可以投诉、报案或依法向法院起诉。',
    refs: [{ law_id: 'women-2022', art: '23', label: '《妇女权益保障法》第23条' }],
  },
  {
    cat: '民事',
    term: '就业性别歧视',
    explain: '用人单位招聘不得限定男性或男性优先，不得进一步询问调查女性求职者婚育情况，不得将妊娠测试作为入职体检项目。',
    refs: [{ law_id: 'women-2022', art: '43', label: '《妇女权益保障法》第43条' }],
  },
  {
    cat: '网络与数据',
    term: '关基采购保密协议',
    explain: '关键信息基础设施运营者采购网络产品和服务，应当与提供者签订安全保密协议，明确安全和保密义务责任。',
    refs: [{ law_id: 'csl-2025', art: '38', label: '《网络安全法》第38条' }],
  },
  {
    cat: '网络与数据',
    term: '重要数据出境',
    explain: '关基运营者境内收集产生的重要数据出境适用网络安全法规定；其他数据处理者的重要数据出境由国家网信部门会同有关部门制定管理办法。',
    refs: [{ law_id: 'dsl-2021', art: '31', label: '《数据安全法》第31条' }],
  },
  {
    cat: '宪法',
    term: '人权保障',
    explain: '国家尊重和保障人权；公民在法律面前一律平等，享有宪法和法律规定的权利，同时必须履行宪法和法律规定的义务。',
    refs: [{ law_id: 'con-2018', art: '33', label: '《宪法》第33条' }],
  },
  {
    cat: '宪法',
    term: '劳动权利与义务',
    explain: '公民有劳动的权利和义务。国家通过各种途径创造劳动就业条件，加强劳动保护，改善劳动条件。',
    refs: [{ law_id: 'con-2018', art: '42', label: '《宪法》第42条' }],
  },
]

const CATS: TermCard['cat'][] = ['治安', '民事', '劳动', '刑事', '程序', '网络与数据', '宪法']

export default function Terms() {
  return (
    <div className="page">
      <PageHeader
        title="术语卡"
        sub="高频法律术语的通俗解释卡片。每张卡都绑定受控语料内的真实条文，点击即可核对原文；通俗解释为项目原创内容，不是法律意见。"
      />
      <div className="banner banner-warm mb-16">
        <Icon name="bulb" size={15} />
        <span className="banner-tx">
          术语解释仅作普法参考，具体案件的适用请结合完整材料咨询执业律师或拨打 12348 法律援助热线。
        </span>
      </div>
      {CATS.map((cat) => {
        const list = TERMS.filter((t) => t.cat === cat)
        if (!list.length) return null
        return (
          <section key={cat} className="mb-20">
            <div className="tiny bold mb-8">{cat}</div>
            <div className="chips">
              {list.map((t) => (
                <div key={t.term} className="card" style={{ padding: '10px 14px', display: 'inline-block', maxWidth: 420, verticalAlign: 'top' }}>
                  <b style={{ fontSize: 13.5 }}>{t.term}</b>
                  <div className="tiny mt-8" style={{ lineHeight: 1.7 }}>{t.explain}</div>
                  <div className="tiny mt-8">
                    {t.refs.map((r) => (
                      <Link key={r.art} to={`/laws/${r.law_id}?art=${r.art}`} className="tiny bold" style={{ color: 'var(--accent-text)', marginRight: 10 }}>
                        {r.label} →
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })}
      <div className="tiny" style={{ paddingBottom: 24 }}>
        以上共 {TERMS.length} 张术语卡将随语料扩张持续增补；术语解释为项目原创普法内容并逐条绑定语料条文，未采用任何 AI 未审核生成。
      </div>
    </div>
  )
}
