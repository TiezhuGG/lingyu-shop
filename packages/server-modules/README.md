# server-modules

T03-A0 新增 StorefrontService，拥有 store/store_fulfillment_draft；单 ONLINE 销售范围支持商城名称与三种履约草稿，不代表实体门店或可执行配送。其他业务通过 readInTransaction 读上下文，写入在 IAM 事务鉴权后执行，不能跨模块改表。公共 JSON Schema 校验器由 foundation 复用，admin 与 Store 使用同一 OpenAPI 来源。

API/Worker 共用后端模块，唯一公开入口为 @lingyu/server-modules。前端不得依赖该包。构建前自动生成本包业务 Prisma 客户端，不导入工程 PoC 的客户端；当前拥有 append-only audit_log、客户身份/会话、管理员 IAM，以及 ONLINE store/store_fulfillment_draft 迁移；没有实体仓店、商品、库存或订单事实。部署需同时保留 dist、generated 和生产依赖。

公开配置、数据库就绪检查、关停装配、普通 HTTP requestId/安全错误边界和 contracts schema 校验。`DatabaseService.runInTransaction` 只给后端应用服务传递一次性的 Serializable 事务上下文；`AuditService` 通过上下文追加受限脱敏摘要并供 IAM 服务读取最近审计，不暴露 Prisma 根客户端或任意表 CRUD。T02-A 使用事务范围的 identity repository、短期签名 access token 和仅保存摘要的可撤销 refresh session；生产环境禁止开发身份入口。

T02-B 的 AdminService 维护独立管理员会话与固定角色，其他模块在自己的写事务内先调用 `authorizeInTransaction` 再写入，不能只信任 guard 或读改管理员表。该方法持有 IAM 事务锁和主体行锁，遇到旧快照冲突整笔重试；业务回调不做外部不可回滚副作用。HTTP 探针不写业务数据。生产配置由进程环境注入；本地启动命令读取根忽略的 .env。初始化、参数和恢复见 docs/development.md。
