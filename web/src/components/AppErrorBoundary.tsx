import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { failed: boolean }

/**
 * 最后一层界面故障护栏：不把运行时异常伪装成空白页，也不自动清除用户本机数据。
 * 具体异常仍写入开发者控制台，供严格视觉巡检捕获。
 */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('LegalHigh UI runtime failure', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="page" style={{ maxWidth: 760, paddingTop: 72 }}>
        <section className="card card-pad">
          <h1 className="ph-t">页面运行失败</h1>
          <p className="ph-sub">系统没有继续展示可能不完整的内容，也没有自动删除本机数据。请刷新重试；若问题持续，请在反馈通道说明发生页面和操作步骤。</p>
          <div className="row mt-16">
            <button className="btn btn-primary" onClick={() => window.location.reload()}>刷新页面</button>
            <a className="btn btn-secondary" href={import.meta.env.BASE_URL}>返回首页</a>
          </div>
        </section>
      </main>
    )
  }
}
