# 安全政策 / Security Policy

## 报告漏洞

请不要在公开 Issue 中披露未修复漏洞、利用代码、真实合同、案件材料、个人信息、API 密钥或管理令牌。请通过 GitHub 仓库所有者提供的私密安全报告渠道联系维护者；如果仓库尚未启用该渠道，请只提交不含漏洞细节的联络请求，等待维护者提供私密方式。

报告应尽量包含：受影响版本或提交、前置条件、最小复现步骤、实际与预期结果、影响判断，以及不含真实个人数据的证据。请勿访问不属于你的数据、扩大权限、执行拒绝服务、持久化、外传材料或测试第三方系统。

Do not disclose an unpatched vulnerability, exploit, real legal document, personal data, API key, or admin token in a public issue. Use the repository owner's private security-reporting channel. If none is enabled, open a detail-free contact request and wait for a private channel.

## 支持范围

当前仓库处于原型验收阶段，没有承诺长期支持的发布分支。维护者只评估当前默认分支中可复现的问题。任何公开部署、第三方修改、关闭安全 gate、绕过身份校验或使用未锁定依赖的实例都不属于已验证配置。

## 已知安全边界

- 认证模型面向单机管理员，不是多租户生产身份系统；不得直接暴露到公网。
- AI 插件可能把用户明确提交的内容发送到用户选定的远程供应商。发送前必须审查供应商条款、数据驻留和保密要求。
- 法律语料和案例摘要可能过期；这属于安全与法律质量风险，正式依赖前必须核验权威来源。
- Electron 安装包仍需代码签名、来源验证和各平台安装测试；工作流存在不代表产物已经验证。

## 密钥处理

密钥只允许来自环境变量或瞬态请求，不得提交到 Git、日志、截图、测试夹具或数据库。发现疑似泄露时应立即吊销并轮换，而不是只删除历史文件。
