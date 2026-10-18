# server-modules

API/Worker 共用后端模块，唯一公开入口为 @lingyu/server-modules。前端不得依赖该包。构建前自动生成本包业务 Prisma 客户端，不导入工程 PoC 的客户端；当前拥有 append-only audit_log 与 T02-A 的 customer/customer_identity/session/used_refresh_token 迁移，不含管理员、商品、库存或订单表。部署需同时保留 dist、generated 和生产依赖。

本批公开配置、数据库就绪检查、关停装配、普通 HTTP requestId/安全错误边界和 contracts schema 校验。`DatabaseService.runInTransaction` 只给后端应用服务传递一次性的 Serializable 事务上下文；`AuditService` 只能用该上下文追加受限、脱敏摘要，二者都不暴露 Prisma 根客户端或任意表 CRUD。T02-A 使用事务范围的 identity repository、短期签名 access token 和仅保存摘要的可撤销 refresh session；生产环境禁止开发身份入口。HTTP 探针不写业务数据。生产配置由进程环境注入；本地启动命令读取根忽略的 .env。详细参数、连接预算和恢复见 docs/development.md。
