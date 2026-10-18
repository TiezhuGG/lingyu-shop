# api

NestJS 模块化单体 API 工程入口；后续业务按 Controller → application → domain → infrastructure 分层。

开发 `pnpm dev:api`，构建 `pnpm --filter @lingyu/api build`（根目录）。当前提供 health/live/ready、HTTP 契约探针，以及受环境严格限制的 T02-A 客户会话端点；尚无微信身份、管理员权限、商品或交易能力。完整说明见 docs/development.md。
