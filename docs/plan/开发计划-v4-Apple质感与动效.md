# 开发计划 v4 —— Apple 质感与动效打磨（长周期）

> 立项日期：2026-09-06。调研依据：`docs/research/Apple设计细节与动效物理调研-2026-09-06.md`（下称「调研」）。
> 定位：**长周期性质**的查漏补缺计划，与 v3《查漏补缺与打磨》同一运行模式——波次推进 + 单元循环（取项→修复→门禁→重拍→回写），本文件登记波次与验收口径，逐轮结果回写 AGENTS.md。
> 总纲：把「参考 Apple」从文案落成**可验证**的视觉系统——颜色层级、材质透明度、背景模糊、边缘高光、阴影、焦点环、对比度统一到同一套参数；动效统一到「时阶 + 弹簧」Token。新增视觉参数必须先落 Token 再使用（计划 §门禁）。

---

## 0. 设计红线（从调研固化，改 UI 前先读）

1. **材质按语义选档，不按颜色选**（HIG 原文）：铬层=Chrome、工作台面板=Panel、卡片=Card、浮层=Float、正文阅读区=Solid 护栏；页面不得私设 blur/alpha 值。
2. **Liquid Glass 只进功能层**：TopBar/侧栏/浮层可用强采样模糊与实验折射；内容层不得使用 Liquid Glass。重复卡片和正文护栏只用半透明叠色；承担空间分区的少数主工作台 `.panel` 可使用一层 standard-material 采样模糊，但内部卡片禁止继续叠加 backdrop-filter。
3. **动效只动 transform/opacity**；位移类状态切换一律用弹簧 Token；hover 反馈 ≤160ms 且只动背景/描边/阴影。
4. **按压反馈对**：按下 ≈80ms 缩小，释放弹簧回位——两段独立曲线。
5. **bounce 分寸**：只有「从无到有」的浮层入场用 bouncy；用户直接驱动的连续交互（拖拽/滑块跟随）不用 bounce；大面积表面用 smooth。
6. **Reduce Motion 双通道**（系统 + 应用内）：只关位移/缩放/循环，保留透明度渐变。
7. **深色模式海拔 = 更亮**（elevation = lighter），中性色阶 Token 双侧同语义。

## 1. 波次

### W1 动效系统基建（Token 层）——本轮实施
- [x] `--dur-press/fast/slow/slower` 时阶 + 既有 `--dur` 保留为基准（160ms）。
- [x] 四档弹簧 linear() 曲线 Token（`--spring-smooth/snappy/bouncy/quick`，参数与生成算法见调研 §4），`@supports` 不支持 linear() 时回退 cubic-bezier。
- [x] 关键帧：`pop-in`（Toast/浮层弹簧入场）、`pop-out`（退场）、`dlg-in/out`（Dialog 缩放弹簧）、`shake`（指数衰减推石）、`press` 由 transition 实现不设关键帧。
- [x] 全站硬编码时长收编（prog 300ms→--dur-slow、flash 420ms→--dur-slower、抽屉 0.25s→--dur-slow、toast 200ms→弹簧）；恒定循环类（shimmer/aurora/pulse）以注释标记豁免。
- 验收：qa_gates 新 gate「动效纪律」全绿（§3）。

### W2 材质系统补全（中性色阶 + 边缘光）——本轮实施
- [x] Apple 中性色阶 Token `--gray-1..6`（浅色：#8E8E93→#F2F2F7；深色：#8E8E93→#1C1C1E，双侧同语义「1=最高对比/最深、6=最贴背景」），语义面（--bg-2/--surface-solid/--elevated 等）改引 Token。
- [x] 液态玻璃边缘光 `--mat-inset`（顶内高光 + 底内阴影成对）接入浮层与铬层；发丝线/焦点环全量 Token 收敛（清掉 `:focus-visible` 残留硬编码、输入框聚焦环改 `--ring-soft`）。
- [x] `--ring-strong/--ring-soft` 两档焦点环 + `--shadow-3`（浮层海拔）入 Token。
- 验收：qa_contrast --strict 全绿；/design-system 展台可目检双侧色阶。

### W3 组件接线（动效落地到交互）——本轮实施
- [x] Toast：弹簧入场（bouncy）+ 退场动画 + 退场后卸载（ToastProvider 状态机）。
- [x] Dialog：遮罩淡入 + 面板弹簧入场/退场（关闭时先播放退场再卸载，API 不变）。
- [x] 开关 Switch：knob 位移弹簧（snappy）+ 按压反馈对；复选同理。
- [x] 分段控件 Segmented（竹简槽）：凹槽轨道 + 滑块弹簧滑动（snappy），用于 设置→外观 与 DesignSystem 展台。
- [x] 按压反馈对接入：.btn/.chip/.tb-icon/.sb-item/.tab/.lrow/.doc-type/.res-act/.cit 等交互面。
- [x] TopBar 滚动海拔（scroll edge effect）：.content 哨兵 IntersectionObserver → `.tb.is-scrolled`（发丝线加深 + 阴影升高，160ms 过渡）。
- [x] 滚动收链：.content/.panel-b/.sb-nav `overscroll-behavior: contain`；装饰裁切 `overflow: clip` 化。
- 验收：行为在浏览器可复现；qa_shots 重拍全路由无回归。

### W4 可验证性与展台——本轮实施
- [x] /design-system 新增「Motion Lab」：弹簧曲线对比（同球三曲线）、按压反馈对演示、shake 触发、Segmented 实操、Toast/Dialog 触发器、滚动海拔说明。
- [x] qa_gates.mjs 增 gate4「动效与材质纪律」：global.css 中 transition/animation 不得出现 Token 外的硬编码时长（恒定循环需行内 `恒定循环` 注释豁免）；禁止新散装焦点环/blur 字面量。
- [x] 新增 `web/scripts/qa_motion.mjs` 动效行为探针：无头 Chrome 实测弹簧物理——bouncy 球必须过冲（实测 230px ≈ 理论峰值 229px）、smooth 球必须无过冲（实测 220.0px）、shake 三段证据（正冲/回摆/归零）、Toast/Dialog 退场后卸载、滑块位移中点采样≠终值；--strict 断言失败退出码 1。
- [x] run_qa.cmd 扩为 6 门（+动效行为探针）。
- 验收：run_qa.cmd 六门全绿。

### W5 长周期滚动项——第二十四轮（2026-09-06）全部落定
- [x] Liquid Glass 「折射边缘」：**评估完成，定为实验档**。实证（无头 Chrome 152，开/关截图字节级对照，`docs/qa-evidence/w5-refract-*.png`）：`backdrop-filter: url(#svg)` 渲染有效且可与 blur() 组合；但旧引擎「解析成功渲染不生效」无法用 @supports 探测、组合值存在整条失效风险 → 产品面板维持 inset 近似，`.m-refract` 实验档（scale=6 轻折射）进 /design-system 材质标尺供目检。结论详情见调研 §3.5。
- [x] 列表项入场 stagger：Motion Lab「重放级联」演示（6 条，法条语境）+ 检索结果页真实接入（46 卡实测，`--si` 序号注入）；Token `--dur-stagger: 20ms` + `rise-in` 关键帧（smooth 曲线，大面积不 bounce），`min(--si, 12)` 封顶尾延迟 ≤240ms；qa_motion 探针断言「70ms 首条渐显/末条仍在 delay → 终态归位」。
- [x] 拖拽跟手（JS 弹簧+速度继承）：**条件未触发，不立项**——当前全站无拖拽交互（合同三栏无拖宽、无看板卡片），待出现真实拖拽需求时按调研 §2.3 立项。
- [x] 滚动驱动动画 CSS 原生化：`scroll-timeline: --st-content` + `.main { timeline-scope }` 双轨落地——支持引擎上 TopBar 海拔由滚动位置连续插值（0–96px 行程，来回可逆），不支持回落 onScroll 哨兵；qa_motion 探针 ⑧ 断言 animationName/边框插值/回顶可逆。
- [x] 大字模式 × 动效联测：qa_motion 探针 ⑨ 实测 zoom 1.15 下弹簧位移等比放大（目标 220→253px）、bouncy 过冲比例不漂移（max 264.6 = 1.046×目标）、smooth 仍无过冲——**结论：弹簧距离与字号解耦（px 固定 + zoom 等比），无需按大字模式单独调参**。
- 验收：run_qa.cmd 六门全绿（pytest 151 / tsc+build / 数据纪律 / WCAG --strict 28 项 / 36 路由巡检 0 问题 / qa_motion 11 断言）。

### W6 完成性复核与参数漂移清偿——2026-09-08
- [x] 对 Apple HIG Materials、SwiftUI Spring/Animation、MDN overflow/overscroll/linear()/scroll-driven/backdrop-filter 重新访问核验，不以旧调研结论代替当前一手证据；复核记录见调研 §7。
- [x] 清除材质展台第二套裸参数：`m-thin/regular/thick/chrome/float/refract` 的模糊与透明度全部引用 `--blur-*`、`--mat-*-a`，并为浅/深主题分别给出语义透明度；展台说明改显示 Token 名，避免文案数值漂移。
- [x] `qa_gates` 增加“材质档禁止复制裸 `--m-blur/--m-a`”门，后续改动若绕开单一参数源直接失败。
- [x] Toast/Dialog 退场卸载从固定 200ms 等待改为真实 `animationend`；组件生命周期不再与 CSS `--dur-fast` 漂移，Toast 计时器在 Provider 卸载时统一清理。
- [x] `qa_motion` 14→20 项：新增 Chrome 材质 computed filter/浅深 alpha、固定条纹背景的 backdrop-filter 开关像素 SHA 差异、`url(#lg-refract)+blur` 对纯 blur 的折射像素 SHA 差异、CDP 真实 Tab 焦点环、深色 Toast 主题继承、Switch 80ms 按下/340ms 弹簧释放；Toast 明确观察 `is-out + pop-out` 后卸载，滚动海拔采样 0/48/96px 严格中间值。探针不再用程序化 `.focus()` 冒充键盘 `:focus-visible`。
- [x] 新增浅色 `/design-system` 与深色 Toast 全页证据；全路由巡检 50→52，0 console/page/network 问题。
- [x] 修复根主题未覆盖 ToastHost：当前 tone 同步到 `html`，深色 Toast computed background=`rgba(44,46,52,0.64)`；Dialog 与 Toast 共享语义材质。
- [x] 强焦点环改为 `--ring-strong`/`--ring-color` 不透明语义 Token；对比度门 28→32 组，浅色基底/卡片分别 4.79/5.22，深色分别 5.39/4.66，全部超过 UI 3:1。
- [x] Chrome 接入成对内缘光 `--mat-inset`，Sidebar 使用 `--sb-inset`，移动抽屉阴影收敛到 `--shadow-drawer`；小型 `.stat` 移除内容层模糊，主工作台 `.panel` 明确定义为单层 standard material，内部卡片不叠加模糊。
- [x] Switch 与首次受众卡补齐按压反馈对；移除 audience/hoverable/ac-card/subj-card 的 hover 位移，并用 gate 禁止 `:hover translate*` 回归。
- [x] 修正 WWDC23 “Animate with springs” 误链（10161→10158），新增 `docs/research/evidence/apple-mdn-motion-materials-2026-09-08.json` 证据索引。
- [x] 隔离后端流程复核：pytest 162；无外部模型密钥的确定性全链 25/25；发布前真值核验十项 ALL PASS；106 组检索金标 hit@5=0.9717、MRR=0.7969；默认数据库与解读源未写入。

## 2. 变更边界（防止「打磨」变「重写」）
- 只动 `web/src/styles/global.css`、`web/src/components/ui.tsx`、`AppShell.tsx`、DesignSystem/Settings 两页与 QA 脚本；不改任何业务页面结构与数据链路。
- 不引入任何运行时依赖（无 framer-motion 等）；弹簧全部由 CSS linear() Token 承载。
- WCAG 门、36 路由巡检、pytest 不得回归。

## 3. 门禁增量（本轮起生效）
- qa_gates gate4「动效与材质纪律」：
  1. `global.css` 中含 `transition:`/`animation:` 的行出现裸时长字面量（`数字ms|s`）→ 必须同时含 `var(--` 或行内注释含 `恒定循环`；
  2. 出现 `0 0 0 3px rgba(`（散装焦点环）→ 必须是 `--ring` 定义行；
  3. 出现 `backdrop-filter` 且 blur 值不是 `var(--blur-` → 失败。
- 回归口径：`run_qa.cmd`（pytest → build → 数据纪律 → WCAG → 巡检）全绿 + `docs/qa-evidence/` 留档。
