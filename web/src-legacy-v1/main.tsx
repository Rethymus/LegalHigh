import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/tokens.css";
import "./styles/materials.css";
import "./styles/base.css";
import "./styles/page.css";
// TDesign 库样式：必须在本项目四个 styles 之后引入，td-bridge.css 再覆盖其 --td-* 默认值（v4 §一）。
// 注：es/style/index.css 仅 19KB（token/reset，无组件样式）；完整组件样式在 dist/tdesign.css。
import "tdesign-react/dist/tdesign.css";
import "./styles/td-bridge.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
