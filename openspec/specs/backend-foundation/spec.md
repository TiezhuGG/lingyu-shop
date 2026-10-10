# 后端公共基础：T01-D

## 已实施能力

- API 与 Worker 只通过 `@lingyu/server-modules` 公开入口装配同一 FoundationModule；包提供 manifest、exports、类型声明、构建和生成脚本。
- workspace 检查识别九个子包，拒绝两前端及其共享客户端包直接或传递依赖 server-modules/backend-shared。
- 启动前显式验证 NODE_ENV、业务 DATABASE_URL、端口、连接池和超时范围；错误只含字段名。PoC 库不能作为业务库，test 只接受独立 lingyu_shop_test，非 test 拒绝该库。
- 本地初始化仅从已验证的 loopback Compose 管理连接创建缺失的业务/测试库，不覆盖已有数据库和业务连接配置；生产不自动初始化或迁移。
- 业务 Prisma schema、迁移边界和生成客户端与 PoC 分开。基础设施拥有 append-only `audit_log` 及其前向迁移，不创建订单、库存或身份表；客户端在类型检查和构建前用同版 CLI 生成。
- DatabaseService 私有持有 PrismaClient/pg 池；每进程有池上限、连接及语句超时，启动验证 SELECT 1。池错误只输出稳定标识，不泄露 SQL、连接 URL 或凭证。
- API `/health` 保留工程响应，`/health/live` 只查存活，`/health/ready` 检查数据库，失败返回 503 和固定消息；恢复后重新就绪。
- 共享关停协调器先标记 draining 并停止接入/保活，再关闭 Nest 和数据库池；重复关停共用同一 Promise，总超时输出标识并非零退出。关停期间 readiness 拒绝新查询，在途池工作完成后释放连接。
- 只有 test 环境且存在 IPC 通道时接受测试关停消息。Linux SIGTERM 与 Windows IPC 的实测证据分别记录在 progress。
- 普通 HTTP 请求安全透传或生成 requestId，成功/错误的响应头与 JSON 均包含它；公开错误只输出稳定码、消息、requestId 和受限校验路径，不回显输入或内部异常。
- `packages/contracts/src/openapi.json` 是工程 HTTP 探针的唯一 schema 来源。生成类型可被两个前端消费，服务端用同一 schema 拒绝未知字段；探针不写业务数据。
- `DatabaseService.runInTransaction` 为应用服务提供 Serializable 事务上下文。只对已验证的冲突形态有限重试，关停等待已开始的事务；上下文失效后不能再追加审计或跨回调复用。
- `AuditService` 只能在同一事务上下文追加受限、脱敏的审计摘要；没有通用 CRUD、更新或删除端口。真实测试证明成功提交、失败回滚和重试只保留最终成功审计。

## 验证和边界

常规 `pnpm test` 不依赖 Docker；`pnpm test:database` 在独立真实测试库执行故障注入、恢复与连接归零验证。测试先拒绝已有连接的库，只临时停用 lingyu_shop_test 的连接并在 finally 恢复，绝不作用于业务库或 PoC。

本批无商城业务规则、身份、Outbox 或消费者，不把工程池排空当成任务/业务事务排空验收。每个后续业务任务仍须定义表归属、锁顺序、幂等键、脱敏审计和不可回滚副作用的 Outbox。数据库账号最小权限、生产迁移发布、远程 CI 成功证据和微信真机仍需后续验收。
