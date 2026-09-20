# 域外判例官方快照封阻证据（2026-09-21）

对 3 件域外判例（Brown v. Board / Miranda v. Arizona / Donoghue v Stevenson）
经 Source Registry 已批准来源做同构官方快照的尝试结果：

- **BAILII**（Donoghue 源，bailii.org/uk/cases/UKHL/1932/100.html）：
  返回 Anubis 反机器人工作量证明挑战页（bailii-anubis-challenge.html，
  「Making sure you're not a bot!」）——curl 层不可达。
- **loc.gov tile**（Brown=usrep347483.pdf / Miranda=usrep384436.pdf）：
  HTTP 403（loc-*-403.bin），带 Referer 重试仍 403。

处置（LEGAL-006：永不绕过访问控制）：不使用无头浏览器解挑战、不伪造会话。
WebFetch 只读通道可定点核验文本（Donoghue Lord Atkin 段已核），但原始字节快照
不可得——逐字机器门对域外判例不可建，登记为源站反自动化措施导致的外部门控，
待批准源提供无反制的 HTML/PDF 时再启用。

影响面：3 件域外判例（brown-v-board / miranda-v-arizona / donoghue-v-stevenson）。
中文指导案例 278 件的快照逐字机器门不受影响。

## 补充（同日二次探测）

- **www.loc.gov/item/usrep347483/**（Brown 主站条目页）：
  WebFetch 通道亦返回 HTTP 403——LOC 主站与 tile 端点同样封阻。
  Brown/Miranda 的定点核验与原始字节快照均不可得。
- **Donoghue**：WebFetch 定点核验通过（Lord Atkin 段确认），但 Anubis 挑战
  使原始字节快照不可得——同类限制。
- **结论维持**：3 件域外判例逐字机器门为源站反自动化措施导致的外部门控。
