# 开发计划 v4 —— Apple 质感与动效打磨（长周期）

> 立项日期：2026-09-06。调研依据：`docs/research/Apple设计细节与动效物理调研-2026-09-06.md`（下称「调研」）。
> 定位：**长周期性质**的查漏补缺计划，与 v3《查漏补缺与打磨》同一运行模式——波次推进 + 单元循环（取项→修复→门禁→重拍→回写），本文件登记波次与验收口径，逐轮结果回写 AGENTS.md。
> 总纲：把「参考 Apple」从文案落成**可验证**的视觉系统——颜色层级、材质透明度、背景模糊、边缘高光、阴影、焦点环、对比度统一到同一套参数；动效统一到「时阶 + 弹簧」Token。新增视觉参数必须先落 Token 再使用（计划 §门禁）。

---

## 0. 设计红线（从调研固化，改 UI 前先读）

1. **材质按语义选档，不按颜色选**（HIG 原文）：铬层=Chrome、工作台面板=Panel、卡片=Card、浮层=Float、正文阅读区=Solid 护栏；页面不得私设 blur/alpha 值。
2. **Liquid Glass 只进功能层**：TopBar/侧栏/浮层可用强采样模糊；内容层（卡片/面板）一律半透明叠色、不开 backdrop-filter（v6 纪律，HIG "Don't use Liquid Glass in the content layer" 背书）。
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

### W5 长周期滚动项（后续轮次，不阻塞本轮）
- [ ] Liquid Glass 「折射边缘」：SVG displacement 边缘（当前以 inset 高光/阴影近似；评估 filter: url() 成本后决定是否升级）。
- [ ] 列表项入场 stagger（骨架屏→内容切换时 20ms 级联），需先在 Motion Lab 验证不干扰阅读。
- [ ] 拖拽跟手（用户直接驱动）改 JS 驱动弹簧 + 速度继承（调研 §2.3 velocity preservation），涉及合同栏拖宽/看板卡片时立项。
- [ ] 滚动驱动动画 CSS 原生化（animation-timeline）替代哨兵方案，待目标浏览器基线达 Chrome/Edge 115+ 且 Safari 26 确认后迁移。
- [ ] 大字模式 × 动效联测（le-font-large 下弹簧距离是否需要放大）。

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
