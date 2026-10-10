# 灵域商城

依据 [技术设计](project-technical-design-v1.md) 建立的 pnpm workspace。已完成框架入口、一期三入口界面预览及本地真实 PostgreSQL/Redis 工程探针；商城业务服务与微信真机验收尚未完成。

- apps：miniapp（小程序）、admin（后台）、api（接口）、worker（任务）。
- packages：contracts（数据契约）、backend-shared（后端内核）、config（配置）、ui-tokens（视觉变量）。
- database：schema、migrations、seeds。
- openspec：specs、changes，暂用 Markdown，未接入 CLI。
- docs：任务、进度、开发方式，以及 architecture、adr、acceptance、data-dictionary、runbooks。
- tests：integration、contract、e2e、load。
- infra：containers、deploy、monitoring。
- scripts：工程结构校验、真实数据库与 Redis 工程探针。

先阅读 [开发路线与实施架构](docs/development-roadmap.md)、[原型验收映射](docs/acceptance/prototype-mapping.md)，再查看 [协作规则](AGENTS.md)、[开发说明](docs/development.md)、[任务](docs/tasks.md) 和 [进度](docs/progress.md)。默认先完成 5000 的 P1-A/P1-B，再增量实现 50000；详细依赖以任务细化表为准。

后端 T01-D 提供 API/Worker 共用配置、HTTP 安全边界、正式事务上下文与 append-only 审计端口；业务库独立于 PoC。首次本地启动前执行 `pnpm db:init:local`，随后执行 `pnpm db:migrate:deploy`，并配置根 `.env`。`/health/live` 与 `/health/ready` 区分存活与数据库就绪。`pnpm test:database` 为单独的真实数据库验收；当前仍无商城业务接口。
