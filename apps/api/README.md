# api

NestJS 模块化单体 API 工程入口；后续业务按 Controller → application → domain → infrastructure 分层。

开发 `pnpm dev:api`，构建 `pnpm --filter @lingyu/api build`（根目录）。当前提供 health/live/ready、HTTP 契约探针、受环境严格限制的 T02-A 客户会话，以及 T02-B 独立管理员 Cookie/CSRF、固定角色与仓范围、账号管理/审计接口。尚无微信身份、实际仓店、商品或交易能力。完整说明见 docs/development.md；业务鉴权通过 server-modules 的公开服务复用，不将交易规则写入 Controller。
