# T01-D1：共享装配、配置与数据库生命周期

## 开工设计

本批只交付后端基础，不提前实现身份、交易或审计。沿用 Nest 12.1.2、Prisma 7.10.0、pg 8.23.1；新增 server-modules 的公开入口供 API/Worker 使用，前端禁止直接或传递依赖服务端包。依赖和生成客户端必须在干净 checkout 可恢复。

业务 Prisma schema/client/migrations 放 packages/server-modules/prisma 和 generated，工程 PoC 保留 database 原路径。业务当前无表，用 Prisma 7.10 默认允许无模型的生成能力实测验证，不人为创建业务表；迁移目录只含锁文件，首张真实表由 D3/业务任务定义。开发 lingyu_shop 与集成 lingyu_shop_test 分离；本地初始化脚本只允许 loopback:15432 的专用 PoC 管理连接，只创建不存在的两个库，不删除/覆盖数据。仅当业务 URL 尚未配置时补齐本地 .env；生产不自动建库/迁移。

配置验证先于 Nest 启动；NODE_ENV 必须为 development/test/production，URL 为 PostgreSQL 且有用户/密码/库名，无 query/hash 覆盖，不接受 PoC 库；test 只用 lingyu_shop_test，非 test 拒绝该库。PORT、DB_POOL_MAX、DB_TIMEOUT_MS、SHUTDOWN_TIMEOUT_MS 有上下界，无效配置只返回字段名，不含输入。Redis 当前不是关键依赖，不伪造 RedisService。

DatabaseService 私有持有业务 PrismaClient 和 pg 池；启动 SELECT 1 验证连接，readiness 带连接/语句超时，liveness 不查数据库。不暴露任意表 CRUD；D3 再提供事务端口。pg 错误只输出稳定标识。API/Worker 设置不同 application_name，便于查询 pg_stat_activity 验证连接归属和释放。

共享关停协调器在信号到来立即标记 draining，停止 HTTP 接入/Worker 保活，关闭 Nest 后释放客户端与池；设总超时，超时日志后非零退出。Windows 无法通过 child.kill(SIGTERM) 验证优雅信号，测试使用仅 test 环境启用的 IPC shutdown；Linux SIGTERM 要单独提供实测证据。当前无业务任务，长事务等待和事务上下文由 D3 补齐。重复信号不重复关停。

验收：配置缺失与错误值脱敏；两入口连接真实隔离测试库，readiness 成功；数据库故障时 liveness 保持 200、readiness 为 503且无内部细节；连接池在途查询排空后关闭、拒绝新查询；两个进程退出后其数据库连接归零；干净生成、类型、构建与测试通过；检查包导入边界。回退应用版本不删除库/卷/迁移，停止进程后修复配置再启动。
