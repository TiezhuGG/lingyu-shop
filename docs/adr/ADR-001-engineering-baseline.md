# ADR-001：工程启动与版本基线

日期：2026-10-07；状态：验证中。

范围：T01 工程入口，不实施业务；T00 业务规则冻结仍为待办，不阻塞健康检查和编译器验证。

采用模块化单体与四应用 workspace；API/Worker 使用 NestJS 12.1.2，API 使用 Express 适配器。管理后台与小程序只显示明确的工程占位页，无模拟商品、订单或资产。

Node 24.21.0、pnpm 12.9.1；TypeScript 选择 5.9.3，避免直接引入 TypeScript 7 迁移；Vue 3.5.43；Vue Router 4.6.3、Pinia 3.0.4 使用已发布兼容组合。后台 Vite 8.3.3；小程序单独采用编译器 peer dependency 要求的 Vite 5.2.8。DCloud 依赖统一锁定 vue3 标签的实际版本 3.0.0-alpha-5030120260930001，其 alpha 命名是实际发布标签，尚不代表微信真机已验证。

包版本、peer dependencies 和许可证直接读取 registry.npmjs.org。Nest/Vue/Vite/Pinia/Router 为 MIT，TypeScript/DCloud 为 Apache-2.0。支持周期与上线前依赖安全审核尚未形成完整结论。

Prisma 默认最新标签当前指向 8 的预发布版本；工程探针采用稳定 7.10.0，客户端与 adapter 同版、pg 8.23.1，不套用 Prisma 6 配置。schema 校验/生成通过，真实 PoC 通过前不宣称 ORM 事务已兼容。Prisma/adapter 为 Apache-2.0，pg 为 MIT。Docker Desktop 引擎当前无法启动，禁止用内存库替代 PostgreSQL 并发语义验收。

首次 peer 校验发现 DCloud 内置 @vue/server-renderer 固定 3.4.21，故小程序 Vue 调整为 3.4.21、Pinia 2.1.7；后台仍使用 Vue 3.5.43/Pinia 3.0.4。两端各自锁版，不强制去重 Vue。包边界只共享契约和视觉值。

验证证据见 docs/progress.md。若编译器与 Vue 版本不兼容，回退对应 DCloud 官方模板兼容组合，保留各端独立 Vite。框架升级需重新运行类型、构建与运行验证。健康检查只证明进程可运行，不代表数据库就绪。

资料：[Nest 模块](https://docs.nestjs.com/modules)、[DCloud CLI](https://uniapp.dcloud.net.cn/quickstart-cli)、[Prisma 7 升级](https://docs.prisma.io/docs/guides/upgrade-prisma-orm/v7)。
