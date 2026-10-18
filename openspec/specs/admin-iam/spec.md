# 管理员身份与仓范围权限

## 独立身份与会话

- 管理员账户、授权绑定、会话分别保存在 admin_account、admin_grant、admin_session，与客户身份和 refresh/access token 隔离；客户凭据不能访问管理员接口，反之亦然。
- 用户名为 3～64 位小写字母开头的字母/数字/点/下划线/短横线；密码为 12～128 字符。服务端用随机盐 scrypt 摘要，不返回密码、摘要或 Cookie 秘密。
- 连续五次失败锁定账户登录 15 分钟；失败响应不区分未知账号、错误密码、停用或锁定。锁定不主动撤销已有会话。每个进程最多两项并发密码计算，超出返回 429；不等于分布式/IP 限流。
- 随机 Cookie 会话有效期为绝对 8 小时，数据库只存其 SHA-256 摘要。生产使用 `__Host-lingyu-admin; Secure; HttpOnly; SameSite=Strict; Path=/`，本地 HTTP 使用 `lingyu_admin`。不向 JS 暴露 Cookie，不在 localStorage 保存认证或 CSRF 数据。
- 登录/当前身份返回权限摘要、过期时间和会话派生 CSRF 值；所有管理员响应为 no-store。刷新页面通过 me 恢复身份；没有自动续期。
- 登录必须 JSON 和精确匹配的 ADMIN_ORIGIN；所有其他写操作必须精确 Origin、非 cross-site Fetch 和 X-CSRF-Token。生产要求显式 HTTPS Origin；不开放跨域凭据接口。

## 固定角色与授权

| 角色 | 范围 | 权限 |
|---|---|---|
| IAM_MANAGER | GLOBAL | iam.admin.read / iam.admin.manage / audit.read |
| STORE_OPERATOR | 单项规范小写仓 UUID | store.read / store.configure / catalog.read / catalog.write / catalog.sku.publish |
| STORE_READER | 单项规范小写仓 UUID | store.read / catalog.read |

每个账户最多 30 条不重复的角色/范围绑定。权限必须来自同一条匹配绑定；A 仓运营与 B 仓只读不授予 B 仓写权限。GLOBAL 账号管理不包含仓业务权限。空授权不允许任何业务功能；未知权限默认拒绝。

仓店事实尚由 T03-A 交付，当前 UUID 只表示权限绑定，不证明仓店存在。`/_access/stores/:storeId` 只验证授权，没有仓店查询或交易副作用。前端不能提交主体 ID、任意权限数组或覆盖服务端权限定义。

## 变更、并发与审计

- 管理员创建、版本化更新、停用需要 IAM_MANAGER；不能编辑自身状态/授权，不能移除最后一个启用的 IAM_MANAGER。用户名称和密码不通过更新接口修改；版本冲突返回 409。
- 状态/授权更新与版本递增、撤销目标所有 session、审计在同一事务提交。每次受保护请求重查真实账户/session 状态、摘要和版本。
- 其他后端业务必须在其写事务内先调用公开 `AdminService.authorizeInTransaction`，再执行业务。该接口按 IAM 事务锁→主体行锁→会话行锁顺序持有至事务完成；Serializable 旧快照遇到撤权/登出更新触发整笔有限重试，再重新鉴权。不得只依靠 Controller guard 或前端按钮隐藏。
- 当前采用全局 IAM 事务锁，优先保证撤权顺序；业务事务必须短且无外部网络调用。后续扩容若改细粒度锁需单独验证锁顺序、死锁与撤权竞争。
- 创建、状态变更、逐项授权新增/移除、登录成功/失败/登出和审计读取有脱敏审计；操作原因使用 onboarding/access_change/offboarding/security 枚举。业务拒绝以及 Origin/CSRF 拒绝用可提交事务留记录，不因失败回滚丢失。格式校验失败和无效 Cookie 不承诺逐次审计。
- IAM_MANAGER 可查询按时间倒序最近 50 条审计；后台展示时间、操作者、对象、动作、变更摘要和请求编号。管理员列表按用户名最多 100 条，尚无分页。

## 初始化、恢复与边界

首个 IAM_MANAGER 只能在 development/test、loopback:15432 且管理员表为空时，通过 `pnpm admin:bootstrap` 手工创建；显式进程环境提供用户名与密码，脚本不输出凭据。无默认账号、自动 seed、生产引导或在线密码重置。已有账户时拒绝重复初始化，不能以删表重置替代恢复。

生产 MFA/强认证、受控账号恢复、分布式限流、生产 HTTPS 代理验收和 session/审计保留治理尚未交付；本规格不表示生产上线门槛已满足。尚无真实仓店/商品/资金权限接口，也不证明微信登录或真机验收。

迁移为追加式建表，不覆盖客户会话或审计事实。恢复优先回退应用并保留表，再前向修复迁移；不使用 drop/reset/清卷。正式环境执行迁移前需另行完成备份恢复及权限审核。
