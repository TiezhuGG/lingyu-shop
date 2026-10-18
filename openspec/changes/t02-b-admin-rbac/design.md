# T02-B：管理员会话、RBAC 与仓范围

状态：实现已归档至 [当前规格](../../specs/admin-iam/spec.md)。沿用 T02-A 的事务、契约和审计基础，不复用客户令牌或客户 session 表；实际验收证据见 docs/progress.md。

## 本批行为与安全边界

- 管理员以用户名/密码登录；密码使用 Node scrypt（N=131072、r=8、p=1、随机 16 字节盐、64 字节输出），KDF 在事务外执行；最多两项并发密码计算。账户连续五次失败锁定 15 分钟，成功登录重置；未知账号使用同参数占位验证，不返回账号存在性。
- 独立 admin_session 保存随机 32 字节 Cookie 秘密的 SHA-256 摘要、8 小时绝对过期和权限版本。生产 Cookie 使用 __Host-lingyu-admin、Secure、HttpOnly、SameSite=Strict、Path=/；本地 HTTP 用 lingyu_admin。客户端只持有 HttpOnly Cookie；页面刷新通过 me 恢复身份。
- 所有写操作必须 Origin 精确等于 ADMIN_ORIGIN，且拒绝 cross-site Fetch。登录使用 JSON 与 Origin 防护；其余写操作还要求 X-CSRF-Token。CSRF 由 Cookie 秘密和固定域标签派生，不授予认证能力，me 返回它以支持重载；客户端仅存于内存。认证响应 no-store。
- 每次请求查真实管理员/session 状态和权限版本；停用/授权调整同事务增加版本并撤销目标全部 session。敏感应用服务在自己的事务内再鉴权。顺序为 IAM 事务 advisory 锁→主体行锁→会话行锁→实时身份/权限校验→目标更新与审计；行锁使等待前取得的 Serializable 旧快照遇到撤权/登出更新时必须重试。其他模块通过公开 authorizeInTransaction 接口复用，不读改 IAM 表；锁随调用方事务结束释放。
- 初始固定角色：IAM_MANAGER（管理员读写、审计读取，无资金/库存权限）；STORE_OPERATOR（当前授权仓的 store.read/store.configure/catalog.read/catalog.write/catalog.sku.publish）；STORE_READER（授权仓的 store.read/catalog.read）。授权按每条绑定检查，A 仓写权限不会因 B 仓只读角色而扩展到 B 仓。默认拒绝未知权限和无仓写入。全局 IAM 角色不能替代业务仓授权。
- store 尚未由 T03-A 创建，因此本批 scopeKey 只校验规范 UUID 并显示为范围编号；不生成假门店，不宣称已校验仓店是否存在。T03-A 创建仓店时接入实际仓归属和显示名。
- 自己不能通过管理接口停用或修改自身授权；不能移除最后一个 ACTIVE IAM_MANAGER。创建账号、改状态/权限、登录/失败/登出和审计查看均留脱敏记录。拒绝/失败记录在可提交的独立事务保留，不依赖将回滚的业务事务。

## 表与公开接口

新增 admin_account、admin_grant、admin_session；角色为固定枚举，grant 唯一键为 admin/role/scopeKey。数据库 CHECK 将 IAM_MANAGER 限于 GLOBAL，将仓角色限于 UUID。account 保存 status、version、failed_login_count、locked_until；session 保存 cookie 摘要与 version，不保存明文密码或 Cookie。

接口位于 /api/v1/admin：auth/login、auth/me、auth/logout，iam/admins 的读/创建/版本化更新，iam/audit 的最近 50 条脱敏审计。/_access/stores/:storeId 是只返回授权结果的边界检查，不是仓店数据接口。DTO 仅由 OpenAPI 生成，不能接受客户端权限列表或覆盖服务端主体。

首个 IAM_MANAGER 仅通过手工 admin:bootstrap 命令，在 development/test 的独立本地数据库且管理员表为空时创建；凭据从进程环境读取，完成后清除环境变量且不输出秘密。生产拒绝此引导路径；无默认账户、无启动自动 seed。生产强认证/MFA、账号恢复和密钥治理仍需上线专项验收。

## 后台与验收

后台交付登录/登出、身份恢复、自己的角色/范围、管理员创建/停用/授权表单（含版本、原因）、审计列表。请求通过同源 /api，Vite 仅在开发时代理到 127.0.0.1:3000；生产需部署同源反向代理。

真实 PostgreSQL/API 覆盖 Cookie 属性、无 Cookie/客户令牌拒绝、缺 Origin/CSRF/错误 Origin 拒绝、登录锁定、跨仓权限组合、伪造版本和 stale session、停用/重启、最后管理员、自身修改与审计脱敏；普通测试验证密码/DTO/策略和 Cookie 解析。构建两前端与两后端，单独记录浏览器验证。

迁移为追加式，可空库部署及在 T02-A 事实旁升级；回退应用保留表，失败前向修复，禁止 drop/reset。bootstrap 不用于重置已有管理员；生产账号恢复另设计受控流程。

## 参数参考（非开发指令）

- [Node 24 scrypt API](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)：显式参数、随机盐和内存上限。
- [OWASP 密码存储指引](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)：本项目选择 scrypt 的 N=2^17、r=8、p=1 组合；同时限制并发，不将 KDF 视为限流替代。
