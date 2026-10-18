# T02-A：客户身份、会话与开发身份隔离

状态：已实施并通过本地 PostgreSQL/API 验收，当前能力见 `openspec/specs/customer-session/spec.md`。本变更只建立第一阶段客户会话基础；不接入真实微信、后台管理员、商品事实或服务端购物车。

## 范围与边界

- 客户主体、可撤销会话和开发身份映射写入业务 PostgreSQL；访问令牌短期有效，刷新令牌为随机不透明值且数据库只保存带服务端 pepper 的摘要。
- access token 的最小声明为 `sub`、`subject_type`、`aud`、`sid`、`permission_version`、`iat`、`exp`；本批客户权限版本固定为 0，T02-B 才增加管理员权限版本的实时校验。仅接受 audience 为 `app`、subject type 为 `CUSTOMER` 的令牌。请求中的主体一律由已验证会话得到，不接受 `userId`、`ownerId` 等输入决定归属。
- 刷新令牌格式包含 session ID 与随机秘密。刷新成功时在同一 Serializable 事务内记录已使用的摘要并替换当前摘要；旧令牌、摘要不匹配、过期或已撤销会话一律失效。只有命中已使用摘要的旧令牌重放才撤销该 session；随机伪造秘密不能撤销他人会话。并发刷新仅一次成功，另一次按重放撤销，客户端须串行刷新并在结果未知时重新认证。
- 登出只撤销当前 session；访问 guard 在每次受保护请求检查 session 未撤销、未过期和客户状态。令牌签名正确但会话已撤销仍返回未认证。
- 仅 `development`/`test` 且显式启用 `AUTH_DEVELOPMENT_LOGIN_ENABLED=true` 时提供开发身份入口。生产环境拒绝该配置和入口；session 保存 `development_only`，关闭开发身份或进入生产后已签发的开发 access/refresh 同样拒绝。开发身份只使用受限标识符，绝不把客户端提交的微信 openid、手机号或任意 customer ID 当作身份。
- 游客购物车在此任务只有小程序本地临时意向：storeId、最多 100 个唯一 SKU、每行 1..999 整数数量，不保存价格或可售事实。使用独立平台存储，认证失败或会话清除不删除它；持久化购物车、稳定 mergeKey、服务端合并和商品校验仍由 T05-C 完成。当前预览页面仍保持禁用业务加购。
- 真实微信 `code` 交换、AppID/Secret、手机号能力及账户合并由 T02-C；管理员 cookie/CSRF、RBAC 与仓范围由 T02-B。两者不得复用本任务的开发入口。

## 数据与事务

新增 `customer`、`customer_identity`、`session` 与仅保存已轮换摘要的 `used_refresh_token`。`customer_identity.provider_key` 是全局唯一、内部构造的提供者命名空间键；本批仅允许 `DEVELOPMENT`，为 T02-C 增加微信 appid/openid 唯一约束预留。`session.subject_type` 先写 `CUSTOMER`，以便 T02-B 后续以不同 audience/凭据接入管理员而不共享客户令牌。

刷新、登出和开发登录都通过 `DatabaseService.runInTransaction` 执行。刷新/登出先锁 session 行，再写轮换摘要与审计；仓储适配只在 server-modules 内部解析事务客户端，公开上下文没有任意 repository 回调或原始客户端属性。身份仓储只处理其自有表；不会暴露 Prisma 根客户端或跨模块表 CRUD。成功的身份创建、session 签发、轮换和撤销与受限审计摘要同事务提交；摘要不包含 access token、refresh token、签名密钥、手机号或请求体。

首次迁移只前向新增表、索引和枚举，不删除 `audit_log` 或已有数据。回退应用必须能与新表共存；迁移失败以追加的前向迁移修复，不 reset/drop 业务库。

## HTTP/契约

新增 `/api/v1/app/auth/development-login`、`/refresh`、`/logout`、`/me`。登录/刷新请求按 OpenAPI 拒绝未知字段；登出主体仅由已认证会话取得。成功响应不回显 refresh token 的哈希或任何密钥，并统一 `Cache-Control: no-store`。refresh token 只在登录/刷新成功响应中短暂返回，客户端不得记录到日志。`/me` 只返回 customerId 与 sessionId，作为后续私人资源归属的 guard 验收，不伪造资产或资料。

统一 HTTP 边界继续产生 requestId；认证失败保持 `401 UNAUTHENTICATED`，开发入口在非开发身份环境以 `404 NOT_FOUND` 隐藏。新增的领域错误不会回显 token、签名错误或数据库细节。

## 验收与恢复

普通测试覆盖配置脱敏、签名/过期/audience、会话提取、开发入口生产拒绝和审计输入；真实隔离 PostgreSQL 覆盖身份创建、刷新轮换、旧 token 重放撤销、登出、被撤销访问令牌拒绝和迁移重复部署。API 进程测试确认未知字段拒绝、owner 不取自客户端输入、响应不泄露刷新令牌摘要。

完成前运行 contracts 生成校验、workspace check、类型检查、构建、普通测试以及 `test:database`。H5/微信构建只证明客户端可编译；真实微信登录和真机能力不得据此标记完成。
