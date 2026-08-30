import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { Button, Checkbox, Dialog, Input, Select, Textarea } from "tdesign-react";
import { notify } from "../components/toast";
import { api, type DraftRecord, type Template } from "../lib/api";
import DocHeader from "../components/DocHeader";
import BottomSheet from "../components/BottomSheet";
import MobileActionBar from "../components/MobileActionBar";
import { useIsNarrow } from "../hooks/useSizeClass";
import { Stamp } from "../components/Stamp";

interface Pool {
  law_id: string;
  title: string;
  articles: Array<{ no: number; label: string; chapter: string | null; excerpt: string }>;
}

type CitationValue = Array<{ law_id: string; article_no: number }>;

/** 律师核验说明默认文案（v4 §二：DialogPlugin + Input，说明写入审计） */
const DEFAULT_VERIFY_NOTE = "已核对事实、当事人信息与引用条文";

function CitationPicker({
  pools,
  value,
  onChange,
}: {
  pools: Pool[];
  value: CitationValue;
  onChange: (v: CitationValue) => void;
}) {
  const [lawId, setLawId] = useState(pools[0]?.law_id ?? "");
  const [q, setQ] = useState("");
  const pool = pools.find(p => p.law_id === lawId);
  const filtered = useMemo(
    () => (pool?.articles ?? []).filter(a => !q.trim() || (a.label + a.chapter + a.excerpt).includes(q.trim())),
    [pool, q],
  );
  const picked = (no: number) => value.some(v => v.law_id === lawId && v.article_no === no);
  const toggle = (no: number) =>
    onChange(picked(no) ? value.filter(v => !(v.law_id === lawId && v.article_no === no)) : [...value, { law_id: lawId, article_no: no }]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {/* v4（§二 Drafting）：选择器方案 B——保留自写条文列表（逐条摘要可见，
            Select filterable multiple 会丢掉每条的 excerpt 预览），仅外层
            法规 Select / 搜索框 / 复选框换 TDesign 控件 */}
        <Select
          value={lawId}
          onChange={v => setLawId(v as string)}
          options={pools.map(p => ({ label: p.title, value: p.law_id }))}
          style={{ flex: 1, minWidth: 0 }}
        />
        <Input value={q} onChange={setQ} clearable placeholder="搜条号/关键词…" style={{ width: 160, flex: "none" }} />
      </div>
      <div style={{ maxHeight: 180, overflow: "auto", border: "0.5px solid var(--hairline)", borderRadius: 10, padding: 4 }}>
        {filtered.slice(0, 60).map(a => (
          <div key={a.no} style={{ padding: "2px 4px", borderRadius: 6 }}>
            <Checkbox checked={picked(a.no)} onChange={() => toggle(a.no)}>
              <span style={{ fontSize: 13 }}>
                <b>{a.label}</b> <span className="faint">{a.chapter ?? ""}</span><br />
                <span className="muted">{a.excerpt}…</span>
              </span>
            </Checkbox>
          </div>
        ))}
        {filtered.length > 60 && <div className="t-caption faint" style={{ padding: 8 }}>仅显示前 60 条，请用关键词过滤</div>}
      </div>
      <div className="t-caption muted" style={{ marginTop: 6 }}>已选 {value.length} 条引用（生成文书将携带这些条文的版本与施行日期快照）</div>
    </div>
  );
}

function DocPreview({ draft }: { draft: Pick<DraftRecord, "content" | "status"> }) {
  const banner =
    draft.status === "issued" ? null
      : draft.status === "verified"
        ? <div className="doc-banner green">已通过人工核验 · 定稿</div>
        : <div className="doc-banner red">草稿 · 未经执业律师核验签发 —— 不得对外发送</div>;
  return (
    <div style={{ position: "relative" }}>
      <div className="doc-preview">
        <span style={{ position: "absolute", top: 18, right: 22, zIndex: 5 }}>
          <Stamp state={draft.status === "issued" ? "issued" : draft.status === "verified" ? "verified" : "draft"} />
        </span>
        {banner}
      {draft.content.sections.map((s, i) => {
        if (s.type === "title") return <div key={i} className="d-title">{s.text}</div>;
        if (s.type === "subtitle") return <div key={i} className="d-subtitle">{s.text}</div>;
        if (s.type === "heading") return <div key={i} className="d-heading">{s.text}</div>;
        if (s.type === "party")
          return <div key={i}>{s.lines!.map((l, j) => <div key={j} className="d-para d-noindent">{l}</div>)}</div>;
        if (s.type === "numbered") return <div key={i} className="d-para">{s.n}、{s.text}</div>;
        if (s.type === "closing")
          return <div key={i}>{s.text.split("\n").map((l, j) => <div key={j} className="d-para d-noindent" style={{ marginTop: 12 }}>{l}</div>)}</div>;
        if (s.type === "signature")
          return <div key={i}>{s.lines!.map((l, j) => <div key={j} className="d-sign">{l}</div>)}</div>;
        const noIndent = s.type === "para_noindent";
        return <div key={i} className={`d-para ${noIndent ? "d-noindent" : ""}`}>{s.text}</div>;
      })}
      {draft.content.gate_note && (
        <div className="t-caption" style={{ color: "var(--ink-2)", marginTop: 14 }}>【说明】{draft.content.gate_note}</div>
      )}
      </div>
    </div>
  );
}

export default function Drafting() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [tplId, setTplId] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, unknown>>({});
  const [draft, setDraft] = useState<DraftRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actor, setActor] = useState("张三");
  const isNarrow = useIsNarrow();       // v3（§二 Drafting）：引用选择器 narrow 折叠
  const [citeOpen, setCiteOpen] = useState(false);
  /* v4：核验弹窗（声明式 Dialog）的说明文本与确认 loading */
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyNote, setVerifyNote] = useState(DEFAULT_VERIFY_NOTE);
  const [verifyConfirming, setVerifyConfirming] = useState(false);

  useEffect(() => {
    api.templates().then(d => { setTemplates(d.templates); setPools(d.citation_pool); }).catch(e => setError(String(e)));
  }, []);

  const tpl = templates.find(t => t.template_id === tplId) ?? null;

  // TDesign 的 id 属性落在包装 DIV 上，label htmlFor 无法关联——把 id 搬到真正的原生输入框（避免重复 id）
  useEffect(() => {
    if (!tpl) return;
    const t = window.setTimeout(() => {
      for (const f of tpl.fields) {
        const wrap = document.getElementById(`f-${f.key}`);
        if (!wrap || wrap.tagName !== "DIV") continue;
        const inner = wrap.querySelector("input, textarea");
        if (inner) {
          inner.id = `f-${f.key}`;
          wrap.removeAttribute("id");
        }
      }
    }, 60);
    return () => window.clearTimeout(t);
  }, [tpl, fields]);

  function selectTpl(t: Template) {
    setTplId(t.template_id);
    setFields(t.template_id === "contract" ? { breach_options: [] } : { legal_basis: [] });
    setDraft(null);
    setError(null);
  }

  async function generate() {
    if (!tpl) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.createDraft(tpl.template_id, fields);
      const fresh = await api.getDraft(res.draft_id);
      setDraft(fresh);
      void notify("文书草稿已生成 · 待执业律师核验", "info");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      void notify(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  /** gate：verify 需带核验说明（写入审计）；issue 直接签发。返回是否成功，
      供核验弹窗决定 destroy（成功）或解除 confirm loading（失败可重试）。 */
  async function gate(action: "verify" | "issue", note?: string): Promise<boolean> {
    if (!draft) return false;
    setBusy(true);
    setError(null);
    try {
      if (action === "verify") {
        await api.verifyDraft(draft.id, actor, "执业律师", note ?? DEFAULT_VERIFY_NOTE);
        void notify("核验成功 · 已留痕", "success");
      } else {
        await api.issueDraft(draft.id, actor);
        void notify("签发成功 · 可对外发送", "success");
      }
      setDraft(await api.getDraft(draft.id));
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      void notify(msg, "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /* v4（§二 Drafting）：律师核验 gate——声明式 <Dialog> + Input（树内渲染；
     插件式 DialogPlugin 与 React 19 不兼容，见 components/toast.tsx 注记）。
     流程：弹窗输入核验说明 → 确认 → verify API；失败保留弹窗可重试 */
  function openVerifyDialog() {
    if (busy) return;
    setVerifyNote(DEFAULT_VERIFY_NOTE);
    setVerifyOpen(true);
  }

  async function confirmVerify(): Promise<void> {
    setVerifyConfirming(true);
    const ok = await gate("verify", verifyNote || DEFAULT_VERIFY_NOTE);
    setVerifyConfirming(false);
    if (ok) setVerifyOpen(false);
  }

  /* v3（§二 Drafting）：主 CTA 双渲染共用同一 handler/disabled/label（逻辑零复制）
     v4（§三.1）：等待态用 Button loading prop 表达 */
  const generateDisabled = busy;

  return (
    <div>
      <DocHeader
        kicker="LEGALHIGH · MODULE 05 · DRAFTING"
        title="生成即可交付"
        lede="结构化模板（字段 + 条件分支）决定版式，生成 DOCX 符合实务排版（A4、仿宋正文、黑体标题、两字符缩进）。律师函强制双轨：AI 只生成草稿，须经「执业律师核验 → 签发」两道 gate 后才可对外发送（《律师法》第13条）。"
        meta={["律师函双轨 gate", "仿宋·黑体·公文页边距", "版本快照绑定"]}
      />

      <div className="draft-layout" style={{ marginTop: "var(--sp-5)" }}>
        <section>
          <div className="panel material-regular elev-1" style={{ marginBottom: "var(--sp-4)" }}>
            <h3 className="t-title3" style={{ marginTop: 0 }}>选择文书类型</h3>
            {/* v3（§二 Drafting）：模板卡容器，narrow 下横向滑动（page.css .tpl-scroll）——身份件不动 */}
            <div className="tpl-scroll">
              {templates.map(t => (
                <div key={t.template_id} className={`tpl-card ${tplId === t.template_id ? "selected" : ""}`} onClick={() => selectTpl(t)}>
                  <h4>{t.name}</h4>
                  <p>{t.description}</p>
                </div>
              ))}
            </div>
            {!templates.length && <div className="t-caption faint">模板加载中…（请确认后端已启动）</div>}
          </div>

          {tpl && (
            <div className="panel material-regular elev-1">
              <h3 className="t-title3" style={{ marginTop: 0 }}>填写要素</h3>
              {tpl.fields.map(f => {
                /* v3（§二 Drafting）：citation_picker 双形态共用同一渲染体/props */
                const citeValue: CitationValue = (fields[f.key] as CitationValue) ?? [];
                const onCiteChange = (v: CitationValue) => setFields({ ...fields, [f.key]: v });
                const picker = (
                  <CitationPicker pools={pools} value={citeValue} onChange={onCiteChange} />
                );
                return (
                <div className="field" key={f.key}>
                  <label htmlFor={`f-${f.key}`}>{f.label}{f.required && <span className="req"> *</span>}</label>
                  {f.type === "text" && (
                    /* v4 §二：input 换 TDesign Input（clearable）；aria-label 直接可达，id 由下方 effect 搬到原生 input */
                    <Input {...({ id: `f-${f.key}`, name: f.key, "aria-label": f.label } as ComponentProps<typeof Input>)} value={(fields[f.key] as string) ?? ""} clearable placeholder={f.placeholder}
                      onChange={v => setFields({ ...fields, [f.key]: v })} />
                  )}
                  {f.type === "textarea" && (
                    /* v4 §二：textarea 换 TDesign Textarea（autosize） */
                    <Textarea {...({ id: `f-${f.key}`, name: f.key, "aria-label": f.label } as ComponentProps<typeof Textarea>)} value={(fields[f.key] as string) ?? ""} placeholder={f.placeholder}
                      autosize={{ minRows: 3, maxRows: 10 }}
                      onChange={v => setFields({ ...fields, [f.key]: v })} />
                  )}
                  {f.type === "textarea_list" && (
                    <Textarea {...({ id: `f-${f.key}`, name: f.key, "aria-label": f.label } as ComponentProps<typeof Textarea>)} value={(fields[f.key] as string) ?? ""} placeholder={f.placeholder ?? "每行一条"}
                      autosize={{ minRows: 3, maxRows: 8 }}
                      onChange={v => setFields({ ...fields, [f.key]: v })} />
                  )}
                  {f.type === "select" && (
                    /* v4 §二：select 换 TDesign Select（保留「请选择…」空位语义） */
                    <Select value={(fields[f.key] as string) ?? ""}
                      onChange={v => setFields({ ...fields, [f.key]: v })}
                      options={[{ label: "请选择…", value: "" }, ...(f.options ?? []).map(o => ({ label: o, value: o }))]} />
                  )}
                  {f.type === "multi_select" && (
                    /* v4 §二：复选换 TDesign CheckboxGroup（breach_options 语义不变，仍写 string[]） */
                    <Checkbox.Group
                      value={(fields[f.key] as string[]) ?? []}
                      onChange={v => setFields({ ...fields, [f.key]: v })}
                      options={(f.options ?? []).map(o => ({ label: o, value: o }))}
                    />
                  )}
                  {f.type === "citation_picker" && (isNarrow ? (
                    <>
                      <Button block variant="outline" theme="default" onClick={() => setCiteOpen(true)}>
                        选择库内条文 · 已选 {citeValue.length} 条
                      </Button>
                      <BottomSheet title="选择库内条文" open={citeOpen} onClose={() => setCiteOpen(false)}>
                        {picker}
                      </BottomSheet>
                    </>
                  ) : (
                    picker
                  ))}
                </div>
                );
              })}
              <div className="field">
                <label>操作人姓名（核验/签发留痕用，模拟）</label>
                <Input value={actor} onChange={setActor} />
              </div>
              <Button className="only-regular" theme="primary" loading={busy} disabled={generateDisabled} onClick={generate}>生成文书草稿</Button>
              {error && <div className="finding risk-high" style={{ marginTop: 12 }}><b>出错了：</b>{error}</div>}
            </div>
          )}
        </section>

        <section>
          {draft && (
            <>
              <DocPreview draft={draft} />
              <div className="gate-bar">
                <span className="badge neutral">状态：{{ draft: "草稿", verified: "已核验", issued: "已签发" }[draft.status]}</span>
                {draft.status === "draft" && (
                  <Button size="small" theme="primary" loading={busy} onClick={openVerifyDialog}>执业律师核验</Button>
                )}
                {draft.status === "verified" && tpl?.gate.issue_label && (
                  <Button size="small" theme="primary" loading={busy} onClick={() => void gate("issue")}>{tpl.gate.issue_label}</Button>
                )}
                <a href={api.draftDocxUrl(draft.id)} download>
                  <Button size="small" variant="outline" theme="default">下载 DOCX{draft.status === "draft" ? "（含草稿水印横幅）" : ""}</Button>
                </a>
                {draft.verified_by && (
                  <span className="t-caption faint">核验人：{draft.verified_by}（{draft.verified_role}）</span>
                )}
                {draft.issued_by && <span className="t-caption faint">签发人：{draft.issued_by}</span>}
              </div>
              {draft.content.citations.length > 0 && (
                <div className="t-caption muted" style={{ marginTop: 8 }}>
                  引用条文版本快照：{draft.content.citations.map(c => `《${c.law_title}》${c.article_label}`).join("；")}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* v3（§二 Drafting）：narrow 下主 CTA 进底部动作栏（未选模板时不渲染空栏） */}
      {tpl && (
        <MobileActionBar>
          <Button theme="primary" loading={busy} disabled={generateDisabled} onClick={generate}>生成文书草稿</Button>
        </MobileActionBar>
      )}

      {/* v4：律师核验 gate 弹窗（声明式 Dialog，树内渲染兼容 React 19） */}
      <Dialog
        visible={verifyOpen}
        header="执业律师核验"
        width={440}
        confirmBtn={{ content: "确认核验", theme: "primary", loading: verifyConfirming }}
        cancelBtn="取消"
        onConfirm={() => void confirmVerify()}
        onClose={() => setVerifyOpen(false)}
      >
        <div className="t-caption" style={{ color: "var(--ink-2)", marginBottom: 8 }}>
          签发前请核对草稿的事实、当事人信息与引用条文。核验说明将写入审计留痕：
        </div>
        <Textarea value={verifyNote} autosize={{ minRows: 2, maxRows: 5 }} onChange={setVerifyNote} />
      </Dialog>
    </div>
  );
}
