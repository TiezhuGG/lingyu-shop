# server-modules

API/Worker 共用后端模块，唯一公开入口为 @lingyu/server-modules。前端不得依赖该包。构建前自动生成本包业务 Prisma 客户端，不导入工程 PoC 的客户端；当前无业务表和迁移，D3/后续业务任务再定义事务与事实表。部署需同时保留 dist、generated 和生产依赖。

本批公开配置、数据库就绪检查、关停装配，以及 T01-D2 的普通 HTTP requestId/安全错误边界和 contracts schema 校验。DatabaseService 不暴露 Prisma 根客户端或任意表 CRUD；HTTP 探针不写业务数据。生产配置由进程环境注入；本地启动命令读取根忽略的 .env。详细参数、连接预算和恢复见 docs/development.md。
