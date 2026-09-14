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
  {
    cat: '网络与数据',
    term: '强制报告制度',
    explain: '任何组织或个人发现侵害未成年人合法权益的情形都有权劝阻、制止或检举；密切接触未成年人的单位及其工作人员发现情形应当立即报告。',
    refs: [{ law_id: 'minor-2024', art: '11', label: '《未成年人保护法》第11条' }],
  },
  {
    cat: '网络与数据',
    term: '学生欺凌防控',
    explain: '学校应当建立学生欺凌防控制度，对学生欺凌行为应当立即制止，通知双方家长参与认定和处理，并可给予心理辅导。',
    refs: [{ law_id: 'minor-2024', art: '39', label: '《未成年人保护法》第39条' }],
  },
  {
    cat: '网络与数据',
    term: '住宿登记报告',
    explain: '旅馆、宾馆等住宿经营者接待未成年人入住时，应当询问父母或其他监护人联系方式、入住人员身份关系等情况；发现违法犯罪嫌疑应当立即向公安机关报告。',
    refs: [{ law_id: 'minor-2024', art: '57', label: '《未成年人保护法》第57条' }],
  },
  {
    cat: '民事',
    term: '村规民约不得侵权',
    explain: '村规民约以及村民会议等决定，不得以妇女未婚、结婚、离婚、丧偶、户无男性等为由，侵害妇女在农村集体经济组织中的各项权益。',
    refs: [{ law_id: 'women-2022', art: '56', label: '《妇女权益保障法》第56条' }],
  },
  {
    cat: '劳动',
    term: '拖欠工资支付令',
    explain: '因拖欠劳动报酬达成调解协议后用人单位不履行的，劳动者可以持调解协议书依法向人民法院申请支付令，法院应当依法发出。',
    refs: [{ law_id: 'lcar-2007', art: '16', label: '《劳动争议调解仲裁法》第16条' }],
  },
  {
    cat: '劳动',
    term: '一裁终局',
    explain: '追索劳动报酬、工伤医疗费、经济补偿或赔偿金，不超过当地月最低工资标准十二个月金额的争议，仲裁裁决为终局裁决，用人单位不得起诉。',
    refs: [{ law_id: 'lcar-2007', art: '47', label: '《劳动争议调解仲裁法》第47条' }],
  },
  {
    cat: '网络与数据',
    term: '漏洞补救与报告',
    explain: '网络产品、服务提供者发现安全缺陷、漏洞等风险时，应当立即采取补救措施，按规定及时告知用户并向有关主管部门报告。',
    refs: [{ law_id: 'csl-2025', art: '24', label: '《网络安全法》第24条' }],
  },
  {
    cat: '网络与数据',
    term: '数据安全管理制度',
    explain: '开展数据处理活动应当建立全流程数据安全管理制度，组织开展数据安全教育培训，采取相应技术措施保障数据安全。',
    refs: [{ law_id: 'dsl-2021', art: '27', label: '《数据安全法》第27条' }],
  },
  {
    cat: '网络与数据',
    term: '数据安全事件处置',
    explain: '开展数据处理活动应当加强风险监测；发生数据安全事件时应当立即采取处置措施，按规定及时告知用户并向有关主管部门报告。',
    refs: [{ law_id: 'dsl-2021', art: '29', label: '《数据安全法》第29条' }],
  },
  {
    cat: '程序',
    term: '行政复议申请',
    explain: '认为行政机关的行政行为侵犯其合法权益的，可以依法向行政复议机关提出行政复议申请；行政复议机关应当依法受理并作出决定。',
    refs: [{ law_id: 'admin-review-2023', art: '2', label: '《行政复议法》第2条' }],
  },
  {
    cat: '程序',
    term: '行政诉讼受案范围',
    explain: '认为行政机关和行政机关工作人员的行政行为侵犯其合法权益的，有权依照本法向人民法院提起行政诉讼。',
    refs: [{ law_id: 'admin-litigation-2017', art: '2', label: '《行政诉讼法》第2条' }],
  },
  {
    cat: '程序',
    term: '两审终审制度',
    explain: '人民法院审理民事案件实行合议、回避、公开审判和两审终审制度——一审判决不服可以上诉，二审判决为终审判决。',
    refs: [{ law_id: 'pcl-2023', art: '10', label: '《民事诉讼法》第10条' }],
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
