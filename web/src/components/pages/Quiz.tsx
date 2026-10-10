import { useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Icon } from '../icons'
import { PageHeader } from '../ui'
import TERMS from '../../data/terms.json'
import type { AppOutletContext } from '../AppShell'

/* 法律知识测评（R339）：基于 215 张已验证术语卡生成选择题——
   纯客户端、零 AI、全确定性。每题从术语卡池随机抽 1 张正确卡 + 3 张同分类干扰卡，
   答题后即时反馈 + 法条深链。数据 100% 来自 R248 机器门核验的术语卡。 */

interface TermT {
  term: string
  cat: string
  explain: string
  refs: { law_id: string; art: string; label: string }[]
}

/** 确定性伪随机（每次进入页面同一序列号生成同一题目集，可复现） */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface QuizQ {
  term: TermT
  options: string[] // 4 个解释文本（1 正确 + 3 干扰）
  correctIdx: number
}

function buildQuiz(all: TermT[], count: number, seed: number): QuizQ[] {
  const rnd = mulberry32(seed)
  const pool = shuffle(all, rnd).slice(0, count)
  return pool.map((t) => {
    // 同分类干扰项优先（提高辨别难度），不够时跨分类补充
    const sameCat = all.filter((x) => x.cat === t.cat && x.term !== t.term)
    const others = all.filter((x) => x.cat !== t.cat && x.term !== t.term)
    const distractors = shuffle(sameCat, rnd).slice(0, 3)
    while (distractors.length < 3 && others.length) {
      const pick = shuffle(others, rnd).find((x) => !distractors.includes(x))
      if (pick) distractors.push(pick)
      else break
    }
    const options = shuffle([t, ...distractors], rnd).map((x) => x.explain)
    return { term: t, options, correctIdx: options.indexOf(t.explain) }
  })
}

const QUIZ_COUNT = 10

export default function Quiz() {
  const { audience } = useOutletContext<AppOutletContext>()
  const [seed, setSeed] = useState(() => Date.now() % 100000)
  const [started, setStarted] = useState(false)
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [selected, setSelected] = useState<number | null>(null)

  const questions = useMemo(
    () => buildQuiz(TERMS as TermT[], QUIZ_COUNT, seed),
    [seed],
  )

  const score = useMemo(
    () => answers.reduce((s, a, i) => s + (a === questions[i].correctIdx ? 1 : 0), 0),
    [answers, questions],
  )

  const restart = () => {
    setSeed(Date.now() % 100000)
    setStarted(false)
    setCurrent(0)
    setAnswers([])
    setSelected(null)
  }

  const q = questions[current]
  const finished = started && current >= questions.length

  return (
    <div className="page">
      <PageHeader
        title="法律知识测评"
        sub="基于受控语料术语卡生成的选择题，每次 10 题。答对答错都会展示法条来源——学法条，不只是选答案。"
      />

      {!started && !finished && (
        <div className="card card-pad" style={{ maxWidth: 520, textAlign: 'center', padding: 32 }}>
          <Icon name="gradcap" size={32} className="muted" />
          <h2 style={{ fontSize: 18, marginTop: 12 }}>准备好了吗？</h2>
          <p className="tiny muted mt-8">
            {QUIZ_COUNT} 道选择题 · 基于 {(TERMS as TermT[]).length} 张已验证术语卡 · 每题附法条原文链接
          </p>
          <button className="btn btn-primary btn-lg mt-16" onClick={() => setStarted(true)}>
            <Icon name="sparkle" size={14} /> 开始测评
          </button>
        </div>
      )}

      {started && !finished && q && (
        <div className="card card-pad" style={{ maxWidth: 620 }}>
          <div className="row mb-12">
            <span className="bdg bdg-blue">{q.term.cat}</span>
            <span className="tiny muted">第 {current + 1} / {questions.length} 题</span>
            <span className="spacer" />
            <span className="tiny">已答对 {score} 题</span>
          </div>

          <h3 style={{ fontSize: 16, marginBottom: 16 }}>
            <b>「{q.term.term}」</b> 的通俗解释是？
          </h3>

          {q.options.map((opt, i) => {
            const isCorrect = i === q.correctIdx
            const isSelected = i === selected
            const showResult = selected !== null
            return (
              <button
                key={i}
                type="button"
                className="lrow"
                style={{
                  width: '100%',
                  textAlign: 'left',
                  marginBottom: 8,
                  border: showResult && isCorrect
                    ? '1.5px solid var(--ok, #1f7a35)'
                    : showResult && isSelected && !isCorrect
                      ? '1.5px solid var(--danger, #b3261e)'
                      : '1px solid var(--div-soft)',
                  background: showResult && isCorrect
                    ? 'rgba(31,122,53,0.06)'
                    : showResult && isSelected && !isCorrect
                      ? 'rgba(179,38,30,0.06)'
                      : 'transparent',
                  cursor: showResult ? 'default' : 'pointer',
                }}
                onClick={() => { if (selected === null) setSelected(i) }}
              >
                <span className="tiny bold" style={{ minWidth: 20 }}>{String.fromCharCode(65 + i)}.</span>
                <span style={{ flex: 1, fontSize: 13, lineHeight: 1.6 }}>{opt}</span>
                {showResult && isCorrect && <Icon name="check" size={14} className="ok" />}
                {showResult && isSelected && !isCorrect && <Icon name="x" size={14} />}
              </button>
            )
          })}

          {selected !== null && (
            <div className="banner banner-info mt-12">
              <Icon name="link" size={14} />
              <span className="banner-tx">
                法条依据：<Link to={`/laws/${q.term.refs[0].law_id}?art=${q.term.refs[0].art}`} className="bold" style={{ color: 'var(--accent-text)' }}>{q.term.refs[0].label}</Link>
                {' '}· 完整解释见<Link to="/terms" className="bold" style={{ color: 'var(--accent-text)' }}>术语卡</Link>
              </span>
            </div>
          )}

          <div className="row mt-16">
            <button
              className="btn btn-primary"
              disabled={selected === null}
              onClick={() => {
                setAnswers([...answers, selected!])
                setSelected(null)
                setCurrent(current + 1)
              }}
            >
              {current + 1 === questions.length ? '查看结果' : '下一题'} <Icon name="chevR" size={13} />
            </button>
          </div>
        </div>
      )}

      {finished && (
        <div className="card card-pad" style={{ maxWidth: 520, textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 40, fontWeight: 700, color: score >= questions.length * 0.7 ? 'var(--ok)' : 'var(--accent-text)' }}>
            {score} / {questions.length}
          </div>
          <p className="tiny muted mt-8">
            {score === questions.length ? '全对！法律常识扎实。' :
             score >= questions.length * 0.7 ? '不错！大部分概念已掌握。' :
             score >= questions.length * 0.4 ? '基础概念还需巩固——术语卡是最好的起点。' :
             '别灰心，从术语卡开始逐条学习。'}
          </p>
          <div className="row mt-16" style={{ justifyContent: 'center', gap: 8 }}>
            <button className="btn btn-primary" onClick={restart}><Icon name="refresh" size={13} />再来一组</button>
            <Link to="/terms" className="btn btn-secondary"><Icon name="bulb" size={13} />浏览术语卡</Link>
          </div>
          <div className="tiny muted mt-16">
            测评题目从 {(TERMS as TermT[]).length} 张已验证术语卡中随机生成，每张卡的解释均绑定受控语料内真实条文。
            {' '}本测评不构成法律意见；具体案件请咨询执业律师或拨打 12348。
          </div>
        </div>
      )}

      {audience === null && (
        <div className="banner banner-info mt-16">
          <Icon name="info" size={14} />
          <span className="banner-tx">请先在首页选择使用视图（普通民众/法学学生/专业律师）再使用测评。</span>
        </div>
      )}
    </div>
  )
}
