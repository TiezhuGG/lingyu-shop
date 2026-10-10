# HTTP 契约边界：T01-D2（验收中）

## 当前实现

- `packages/contracts/src/openapi.json` 是唯一的公共 HTTP schema 来源。`openapi-typescript` 7.13.0 从它生成 `src/generated/openapi.ts`；`pnpm contracts:verify` 重建后拒绝生成文件漂移。
- contracts 导出生成类型、无框架绑定的薄客户端及原始 OpenAPI 文档；admin 和 miniapp 只导入这些客户端类型，工程检查继续禁止其依赖 server-modules 或 backend-shared。
- API 为每个 HTTP 请求产生或安全透传 requestId，并同时写入 `X-Request-Id` 和 JSON 响应。上游 ID 仅接受 8–64 位白名单字符，其他值替换为服务器 UUID。
- 全局错误边界的公开结构为 `{ code, message, requestId, details? }`。它不返回框架异常文本、栈、SQL、URL、凭证、请求体或字段值。探针的校验 details 最多 20 条，只包含安全路径和规则名。
- `POST /api/v1/_contract/probe` 是无数据库写入、无业务副作用的工程端点。它接受 `amountMinor` 十进制字符串与 `pickup`/`delivery` 枚举，拒绝未知字段、JSON number 金额和未知枚举；不代表商品、报价、订单或身份能力。

## 验收边界

契约生成、contracts/server/API/admin/miniapp 类型检查、微信构建、H5 构建和非 Docker 测试已通过。真实 API 进程下的契约请求/错误断言已经写入 `foundation-database.test.mjs`，但本机 Docker daemon 当前不可达，尚未执行；因此本 spec 不是 T01-D2 完成声明。供应商 webhook、身份错误语义、业务 DTO、事务审计及 OpenAPI 版本演进由相应后续任务扩展。
