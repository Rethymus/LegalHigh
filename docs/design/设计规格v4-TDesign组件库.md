# 设计规格 v4 —「站在轮子上」TDesign 组件库 × 纸与玻璃主题桥（2026-08-29）

> 反思：v2/v3 的控件全部手搓（原生 button/input/table + 自写 CSS），细节（焦点态/悬停/过渡/禁用/加载）达不到成熟组件库水准——「单纯把文字放上去」。v4 引入**腾讯 TDesign React**（`Tencent/tdesign-react` 962★，npm 1.18.2，2026-08-14 发布；设计系统主仓 `Tencent/tdesign` 4,040★；主题变量见 `tdesign-common/style/web/theme/_light.less/_dark.less`——`--td-*` CSS 变量体系），以**主题桥**方式把「纸与玻璃」映射进 TDesign，控件层全部换库，身份层（DocHeader/EvidenceChain/Stamp/CitationCard/Masthead/TocRow/移动壳层）保留。

## 一、主题桥（Agent I 实施，新文件 web/src/styles/td-bridge.css）

TDesign 通过 `--td-*` 变量与 `<html theme-mode="dark|light">` 属性换肤。映射（在 `:root` 与 `[data-theme="dark"]` 各一份）：

| TDesign 变量 | 我方 token |
|---|---|
| `--td-brand-color` / `-hover` / `-active` / `-focus` / `-disabled` | `var(--accent)` 系（hover 用 color-mix 提亮 6%，active 压暗 6%） |
| `--td-bg-color-page` | `var(--paper)` |
| `--td-bg-color-container` / `-secondary` / `-container-hover` | `var(--paper-2)` / `var(--paper-3)` / `var(--n100)` |
| `--td-warning-color` / `-error-color` / `-success-color` | `var(--orange)` / `var(--red)` / `var(--green)` |
| `--td-text-color-primary` / `-secondary` / `-placeholder` / `-disabled` / `-anti` | `var(--ink)` / `var(--ink-2)` / `var(--ink-3)` / `var(--ink-3)` / `var(--paper)` |
| `--td-component-border` / `--td-component-stroke` | `var(--hairline-strong)` / `var(--hairline)` |
| `--td-radius-small/medium/large/round` / `--td-radius-extraLarge` | 6/10/14px / 999px |
| `--td-font-family` | 我方 sans 栈 |

**同步机制**：App.tsx 与 MobileNav 的 useTheme 在切换时同时设置 `document.documentElement.dataset.theme` 与 `theme-mode` 属性（`setTDesignMode()` 小工具：`html.setAttribute("theme-mode", t === "dark" ? "dark" : "")`）；index.html 的 FOUC 脚本同步补一行。引入方式：`import "tdesign-react/es/style/index.css"`（main.tsx，在自家 styles 之后导入以便桥接覆盖）。

## 二、控件替换总表（Agent I 做 QA 试点 + 壳层；Agent J 全量铺开）

| 手搓控件 | 换成 | 备注 |
|---|---|---|
| `button`（主/次/幽灵） | `<Button theme="primary"|"default"|"ghost">` | 全局 base.css 的 button 样式保留给「非库控件」（tabbar/tab/chip/iconbtn 等身份件），**页面内表单与操作按钮一律 TDesign** |
| `input/textarea` | `<Input clearable>` / `<Textarea>` | 案情/问题框 autosize |
| `select` | `<Select filterable>`（引用选择器必开 filterable） | |
| 复选 | `<CheckboxGroup>` / `<Checkbox>` | 法律范围、违约条款多选 |
| 风险徽章 `.badge.high/...` | `<Tag theme="danger|warning|success" variant="light">` | RiskBadge 内部换 Tag，导出签名不变 |
| 状态徽章（待复核/已采纳…） | `<Tag variant="light-outline">` | |
| Compliance 三个 `src-table` | `<Table>`（size=small，stripe hover） | 数据结构化传 columns |
| 异步等待文案 | `<Loading text=…>` | 检索/分析/生成中 |
| 无结果/错误空态 | `<Empty>` | QA 无命中、审查零发现 |
| **律师核验**（原 window.prompt 已移除） | `DialogPlugin.confirm` + Input | 恢复 gate 仪式感：弹窗输入核验说明→确认→verify API（说明写入审计） |
| 操作反馈 | `MessagePlugin.success/info/warning` | 采纳/驳回/签发/工单受理/下载完成 全部加 toast |
| 错误提示 `.finding risk-high` | 保留（业务语义强）+ 顶部 `MessagePlugin.error` 双通道 | |

## 三、细节打磨清单（Agent J 逐条落）

1. QA 检索按钮 loading 态用 Button 自带 `loading` prop（替代文字变化）。
2. 引用选择器 Select 换 `filterable` + `multiple`（替代手写搜索框+复选列表），选中条数显示在 trigger。
3. Drafting 表单字段间距统一 `--td-comp-margin-s` 节奏；模板卡横向滑动保留（身份件）。
4. Review 批注操作按钮换 TDesign Button（size=small，theme=danger/default），状态 Tag 化。
5. Compliance 评测指标卡数字用 `--td-font-family-number`? 保持 mono（身份）——仅卡片容器换 `.t-card` 质感或保留 material-thin（保留）。
6. 全局：表单 label 用 TDesign Form/FormFormItem？——**不强制重构表单结构**（改动面过大），仅控件级替换；label 样式对齐 TDesign 输入标签（13px/--ink-2）。
7. 底部 tabbar/动作栏/BottomSheet/DocHeader/EvidenceChain/Stamp/CitationCard/Masthead/TocRow = 身份件，**不动**。

## 四、验收（主会话）

1. `npm run build` 通过；39/39 后端测试不受影响。
2. 桌面 1440×900 明暗两模式 + 移动 390×844 各截一轮（29-32 号段）；对照判据：表单控件焦点环/悬停态为 TDesign 标准态（非浏览器默认 outline）；表格有库级 hover/stripe；toast 出现；核验弹窗为 TDesign Dialog。
3. `html[theme-mode]` 与 `data-theme` 永远同步（切换一次验证两属性）。
