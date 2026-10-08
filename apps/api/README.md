# api

NestJS 模块化单体 API 工程入口；后续业务按 Controller → application → domain → infrastructure 分层。

开发 `pnpm dev:api`，构建 `pnpm --filter @lingyu/api build`（根目录）。仅提供 /health 工程健康检查，无数据库就绪检查或业务能力。完整说明见 docs/development.md。
