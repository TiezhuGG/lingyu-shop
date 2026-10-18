# 客户身份与会话：T02-A

## 已实施能力

- 业务 PostgreSQL 保存 customer、customer_identity、session 及 used_refresh_token，开发身份以内部 provider_key 唯一映射到客户。API/Worker 仅通过 server-modules 公开服务装配；身份仓储持有自己的事实。
- `POST /api/v1/app/auth/development-login` 只在 development/test 且显式启用时签发开发客户会话；production 拒绝启用配置。session 记录开发来源，关闭开发身份或进入生产后，同一来源的已签发 access/refresh 也被拒绝。
- access token 使用固定 HS256 签名及最小声明 sub、subject_type、aud、sid、permission_version、iat、exp。客户 audience 为 app，客户权限版本目前为 0。守卫每次查询真实 session 和 ACTIVE 客户，只从会话产生 owner，不相信请求传入的 customerId。
- refresh token 是 session UUID 加 32 字节随机秘密；数据库只保存 pepper HMAC 摘要。刷新先锁 session，在同一 Serializable 事务记录旧摘要并替换当前摘要和审计。已使用令牌重放撤销整个 session；随机伪造秘密只拒绝该次认证，不能撤销他人会话。
- 同一 refresh 并发提交时只有一次轮换成功，重复提交触发重放撤销。客户端必须串行刷新；响应丢失等结果未知情形需重新认证，当前薄客户端没有自动刷新重试器。
- `POST /refresh` 旋转会话，`POST /logout` 撤销当前会话，`GET /me` 只返回当前 customerId/sessionId。认证过期、撤销、客户停用、错误 audience/主体或伪造签名均返回未认证。所有 auth 响应禁止缓存，身份审计与变更同事务且不包含凭据。
- OpenAPI 是登录/刷新 DTO 唯一来源；未知字段拒绝，刷新秘密接受完整 base64url 字符集。contracts 提供薄客户端；签名密钥与 pepper 必须至少各 32 字节且不同。
- 小程序提供平台 session 存取及独立游客意向存取。游客意向只保存单仓、最多 100 个唯一 SKU 与每行 1..999 整数数量；会话失效/清除不删除游客意向，不保存价格或可售事实。

## 验收与恢复

隔离真实 PostgreSQL/API 验证身份唯一、并发首次登录、轮换/重放、伪造秘密不误撤销、并发刷新、停用、过期、登出、API 进程重启后的会话恢复和生命周期故障恢复。平台存储适配测试验证游客意向保留、重复 SKU/非法数量拒绝；平台替身与真实数据库证据分开。

迁移支持空库部署及原两项迁移上的前向升级；重复部署无待执行项。会话秘密与历史摘要仅由身份模块访问，历史摘要随所属 session 删除级联清理；目前没有过期会话定时清理任务，保留周期与任务清理由后续运维/任务设计确定。回退应用不删除身份表或数据；禁止回退到缺少本批重放保护的认证实现。

## 边界

开发登录用于隔离本地联调，不是微信身份。真实微信登录、手机号/账户合并由 T02-C；管理员会话、RBAC/仓范围由 T02-B；服务端购物车、幂等游客合并和界面加购由 T05-C。现有小程序页面保持预览入口，尚未连接真实微信登录或真实购物车。微信/H5 构建不证明微信真机验收。远程 CI、生产发布/密钥轮换、过期凭据保留策略仍由相应后续任务验收。
