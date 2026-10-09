# 后端公共基础：T01-D1

## 已实施能力

- API 与 Worker 只通过 `@lingyu/server-modules` 公开入口装配同一 FoundationModule；包提供 manifest、exports、类型声明、构建和生成脚本。
- workspace 检查识别九个子包，拒绝两前端及其共享客户端包直接或传递依赖 server-modules/backend-shared。
- 启动前显式验证 NODE_ENV、业务 DATABASE_URL、端口、连接池和超时范围；错误只含字段名。PoC 库不能作为业务库，test 只接受独立 lingyu_shop_test，非 test 拒绝该库。
- 本地初始化仅从已验证的 loopback Compose 管理连接创建缺失的业务/测试库，不覆盖已有数据库和业务连接配置；生产不自动初始化或迁移。
- 业务 Prisma schema、迁移边界和生成客户端与 PoC 分开。当前业务 schema 无模型、无业务迁移，客户端在类型检查和构建前用同版 CLI 生成。
- DatabaseService 私有持有 PrismaClient/pg 池；每进程有池上限、连接及语句超时，启动验证 SELECT 1。池错误只输出稳定标识，不泄露 SQL、连接 URL 或凭证。
- API `/health` 保留工程响应，`/health/live` 只查存活，`/health/ready` 检查数据库，失败返回 503 和固定消息；恢复后重新就绪。
- 共享关停协调器先标记 draining 并停止接入/保活，再关闭 Nest 和数据库池；重复关停共用同一 Promise，总超时输出标识并非零退出。关停期间 readiness 拒绝新查询，在途池工作完成后释放连接。
- 只有 test 环境且存在 IPC 通道时接受测试关停消息。Linux SIGTERM 与 Windows IPC 的实测证据分别记录在 progress。

## 验证和边界

常规 `pnpm test` 不依赖 Docker；`pnpm test:database` 在独立真实测试库执行故障注入、恢复与连接归零验证。测试先拒绝已有连接的库，只临时停用 lingyu_shop_test 的连接并在 finally 恢复，绝不作用于业务库或 PoC。

本批无业务规则、身份、公共 HTTP 错误契约、审计、Outbox 或生产事务上下文，分别由 D2/D3 和后续任务实施。Worker 没有消费者，不把工程池排空当成任务/业务事务排空验收。数据库账号最小权限、生产迁移发布、远程 CI 成功证据和微信真机仍需后续验收。
