# T01-D2：HTTP 安全边界与契约生成探针

状态：完成。真实 API/数据库进程验收已通过；D3 事务/审计端口另见 `t01-d3-transaction-audit`。

## 目标与边界

本子项只建立 HTTP 交叉关注点及无业务副作用的工程探针，不创建商城表、身份、会话、审计事实或交易规则。API 继续只绑定 loopback；Worker 没有 HTTP 入口。T01-D3 才提供正式事务和审计端口。

每个普通 API 请求拥有 `requestId`：仅透传 8–64 位、由字母数字开头且后续只含字母数字、`.`、`_`、`-` 的 `X-Request-Id`；其余输入一律替换为服务器 UUID，避免日志/响应头注入。成功和错误响应均回显该响应头与 JSON 内的 ID。

全局错误边界只输出 `{ code, message, requestId, details? }`。校验失败、认证、授权、未找到、冲突、业务校验、限流、就绪失败和未知异常分别映射稳定的公开码与状态；未知异常固定为 500/`INTERNAL_ERROR`。不透传 Nest 异常消息、栈、SQL、URL、凭证、请求体或字段值。校验细节只包含受限字段路径和规则名，最多 20 条，不回显输入。

## 单一来源与生成方式

`packages/contracts/src/openapi.json` 是本批唯一的公共 schema 来源：使用 OpenAPI 3.1 / JSON Schema，定义 requestId、统一成功/错误包络以及 `POST /api/v1/_contract/probe` 的请求和响应。该探针只验证 `amountMinor` 的非浮点十进制字符串、配送枚举和未知字段拒绝，不读取或写入业务事实。

`openapi-typescript` 从该文件生成 `packages/contracts/src/generated/openapi.ts`，其类型被 contracts 薄客户端和两个前端的编译探针使用；禁止另写同名 DTO。server-modules 仅从 contracts 读取该 schema，并用 AJV 编译同一段请求 schema 执行运行时白名单校验。AJV 不接受任何业务策略或持久化职责。

版本锁定为 `openapi-typescript` 7.13.0（peer 为 TypeScript 5.x，项目为 5.9.3）和 AJV 8.20.0；前端不会导入 AJV。生成命令必须可重复执行，验证会在重生成后检查 git diff。admin（Vue/Vite）和 miniapp（DCloud/Vite）均只导入生成的类型，以确认其编译器可消费契约而不把 server-modules 带入客户端依赖图。

## HTTP 行为与验收

`POST /api/v1/_contract/probe` 接收：

```json
{"amountMinor":"1250","deliveryMode":"pickup"}
```

成功返回 `200`、`OK` 成功包络、原样的合法 amount/枚举及 requestId。多余字段、数值型 amount、负数/前导零格式和未知枚举返回 `400`/`VALIDATION_FAILED`；缺失路径返回统一 `404`/`NOT_FOUND`。输入的无效 request ID 不得出现在响应头或 JSON 中。API 单元/进程测试覆盖上述行为与安全脱敏；生成后 API、Worker、admin、miniapp 全部 typecheck/build。

OpenAPI 文档只为探针标注公开、不承诺商品 API；路径中 `/_contract/` 清晰隔离，未来业务端点在各自任务中增加 schema、鉴权、权限和领域错误码。付款 webhook 等供应商端点不复用普通 HTTP 错误格式，按 T10 单独设计。

## 恢复与演进

本批不迁移数据库，不写回数据；回退应用只会移除探针，已生成文件可由锁定工具从 schema 重建。兼容期内只允许向 schema 追加可选字段/路径；变更必填字段、删除字段或改变枚举语义需升级 API 版本并在对应任务提供迁移窗口。CI 必须运行生成并拒绝生成文件漂移。
