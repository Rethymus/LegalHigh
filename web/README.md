# LawEdge AI · 法律智能知识库（前端）

按产品原型设计图**一比一复刻**的桌面工作台（2026-08-29 重构版）。整幅页面为一个
1548px 设计幅面：上排 = 主控台（玻璃侧栏 + Hero + 功能卡 + 内容行）+ 目标用户画像 +
高价值发展方向 / MVP 路线图 / 合规保障；下排 = 文书工具（合同起草）+ 案例详情 +
设计系统规范，小视口自动等比缩放整幅呈现。

## 运行

```bash
npm install       # 首次
npm run dev       # 开发（默认 5173）
npm run build     # tsc --noEmit + vite build
npm run preview   # 预览产物（默认 4173）
```

要求 Node ≥ 20.19（当前使用 22.14）。技术栈：React 19 + TypeScript + Vite 8。
未使用组件库——全部视图为手写组件 + 一份全局样式，保证对原型的像素级控制。

## 结构

```
src/
  main.tsx  App.tsx            # 入口与整幅版式（含 fit-scale 等比缩放）
  data/content.ts              # 全站文案/结构化数据（接真实数据源时只改这里）
  components/
    Dashboard.tsx  Sidebar.tsx  Hero.tsx  FeatureCards.tsx  ContentRow.tsx
    RightRail.tsx（画像 + 研究面板）  DocTools.tsx  CaseDetail.tsx  DesignSystem.tsx
    icons.tsx                  # 30+ 内联线性图标（24 viewBox / currentColor）
  styles/global.css            # 设计 Token + 全部样式
src-legacy-v1/                 # 上一版前端（TDesign 移动端架构，已被本版取代，留档）
```

## 设计 Token（与原型「设计系统规范」窗口一致，依据 Apple HIG）

- 浅色：背景 `#F5F5F7` / 主文字 `#1D1D1F` / 次要 `#8E8E93` / 分隔 `#E5E5EA`
- 深色：base `#0B0B0D` / elevated `#1C1C1E`（设计系统窗口即深色 elevated 层）
- 强调色 `#0A84FF`；键盘焦点环 3px（`:focus-visible`）；正文对比度 ≥ 4.5:1
- 玻璃材质（72–78% 半透明 + blur）只用于侧栏/交互层，内容卡片为实底 —— 遵循
  HIG「材质承担层级」的建议

## 与产品的对应关系

- 案例详情窗口的「判决结果 + 与中国相关案例对比」对应调研报告 §6 的**中外案例
  对照**形态：域外案例只作说理性对照，不作为中国法上的裁判依据。
- 文书工具窗口对应调研报告 §7/§8：合同条款风险提示（高风险/中风险分级）+ 相关
  法条回链 + 律师批注留痕的工作台雏形；正式实现须走「AI 起草草稿 + 执业律师核验
  签发」双轨（《律师法》第 13 条红线）。
- 右栏路线图与调研报告 §9 的 P0/P1/P2 优先级一致。

## 复刻验证

`docs/design/preview-1560.png`（整幅）与 `preview-1280.png`（等比缩放）为与原型
逐窗口比对后的最终截图。
