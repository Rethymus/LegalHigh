// 路由表：22+ 独立页面 Frame，共享 AppShell / 设计 Tokens / 组件
// 懒加载：每个页面独立 chunk；语料 laws.json 运行时按需拉取
import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell, { PageFallback } from './components/AppShell'

const Dashboard = lazy(() => import('./components/pages/Dashboard'))
const NeedsParse = lazy(() => import('./components/pages/NeedsParse'))
const SearchHome = lazy(() => import('./components/pages/SearchHome'))
const SearchResults = lazy(() => import('./components/pages/SearchResults'))
const LawsBrowse = lazy(() => import('./components/pages/LawsBrowse'))
const LawDetail = lazy(() => import('./components/pages/LawDetail'))
const CaseSearch = lazy(() => import('./components/pages/CaseSearch'))
const CaseDetail = lazy(() => import('./components/pages/CaseDetail'))
const Research = lazy(() => import('./components/pages/Research'))
const EvidenceInspector = lazy(() => import('./components/pages/EvidenceInspector'))
const ContractLibrary = lazy(() => import('./components/pages/ContractLibrary'))
const ContractReview = lazy(() => import('./components/pages/ContractReview'))
const ContractCompare = lazy(() => import('./components/pages/ContractCompare'))
const Drafting = lazy(() => import('./components/pages/Drafting'))
const DraftValidation = lazy(() => import('./components/pages/DraftValidation'))
const ComparativeLaw = lazy(() => import('./components/pages/ComparativeLaw'))
const Learning = lazy(() => import('./components/pages/Learning'))
const Workspace = lazy(() => import('./components/pages/Workspace'))
const MatterDetail = lazy(() => import('./components/pages/MatterDetail'))
const Collections = lazy(() => import('./components/pages/Collections'))
const DataSources = lazy(() => import('./components/pages/DataSources'))
const AuditHistory = lazy(() => import('./components/pages/AuditHistory'))
const Settings = lazy(() => import('./components/pages/Settings'))
const DesignSystem = lazy(() => import('./components/pages/DesignSystem'))

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* 01 Dashboard */}
        <Route path="/" element={<Dashboard />} />
        {/* 需求解析（抽象描述 → 可溯源法条+案例） */}
        <Route path="/needs" element={<NeedsParse />} />
        {/* 02/03 Global Legal Search & Results */}
        <Route path="/search" element={<SearchHome />} />
        <Route path="/search/results" element={<SearchResults />} />
        {/* 04 Law Browse & Law Detail */}
        <Route path="/laws" element={<LawsBrowse />} />
        <Route path="/laws/:lawId" element={<LawDetail />} />
        {/* 05/06 Case Search & Detail */}
        <Route path="/cases" element={<CaseSearch />} />
        <Route path="/cases/:caseId" element={<CaseDetail />} />
        {/* 07 AI Research · 08 Evidence Inspector */}
        <Route path="/research" element={<Research />} />
        <Route path="/research/:rid" element={<Research />} />
        <Route path="/research/:rid/evidence" element={<EvidenceInspector />} />
        {/* 09/10/11 Contracts */}
        <Route path="/contracts" element={<ContractLibrary />} />
        <Route path="/contracts/:cid" element={<ContractReview />} />
        <Route path="/compare" element={<ContractCompare />} />
        {/* 12/13 Drafting & Validation */}
        <Route path="/draft" element={<Drafting />} />
        <Route path="/draft/validation" element={<DraftValidation />} />
        {/* 14–17 */}
        <Route path="/comparative" element={<ComparativeLaw />} />
        <Route path="/learning" element={<Learning />} />
        <Route path="/workspace" element={<Workspace />} />
        <Route path="/workspace/matters/:mid" element={<MatterDetail />} />
        {/* 18–21 */}
        <Route path="/collections" element={<Collections />} />
        <Route path="/data-sources" element={<DataSources />} />
        <Route path="/audit" element={<AuditHistory />} />
        <Route path="/settings" element={<Settings />} />
        {/* 22 Design System（内部，不在导航） */}
        <Route path="/design-system" element={<DesignSystem />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

// PageFallback 供懒加载 Suspense 使用（在 AppShell 内已引用）
export { PageFallback }
