# 灵域商城

依据 [技术设计](project-technical-design-v1.md) 建立的 pnpm workspace。已接入框架工程入口和健康检查，无商城业务能力；真实数据库与微信真机验证尚未完成。

- apps：miniapp（小程序）、admin（后台）、api（接口）、worker（任务）。
- packages：contracts（数据契约）、backend-shared（后端内核）、config（配置）、ui-tokens（视觉变量）。
- database：schema、migrations、seeds。
- openspec：specs、changes，暂用 Markdown，未接入 CLI。
- docs：任务、进度、开发方式，以及 architecture、adr、acceptance、data-dictionary、runbooks。
- tests：integration、contract、e2e、load。
- infra：containers、deploy、monitoring。
- scripts：工程结构校验。

阅读 [协作规则](AGENTS.md)、[开发说明](docs/development.md)、[任务](docs/tasks.md) 和 [进度](docs/progress.md)。
