# 商城销售范围与三种履约规则草稿

## 公开范围

按 ADR-003 先提供单主体、单 ONLINE 销售范围，稳定 storeId 为 `00000000-0000-4000-8000-000000000001`，供商品/价格/车与授权归属；不代表真实门店或凭据。

GET /api/v1/app/storefront 返回 configured/displayName/version 及三种保留的方法 EXPRESS（快递）、LOCAL_DELIVERY（同城）、PICKUP（自提）。未配置为 false/null/0；迁移和读取不自动创建店铺、地址、费用或账号。响应 no-store；enabledMethods 始终为空，physicalStoreEnabled/checkoutEnabled 始终 false。公开不返回草稿费用、范围说明或自提地址。

三种履约均保留，名称或草稿保存不表示可收费、下单、配送或自提。可执行区域/时段/自提点校验与开通留 T03-A1，报价/实际履约留 T08-B/T11-A，不要求真实实体门店才能开发商品。

## 管理接口与草稿

GET /api/v1/admin/storefront 需同范围 store.read，PUT 需 store.configure、管理员 Cookie、精确 Origin 和 CSRF。STORE_OPERATOR 可读写、STORE_READER 只读；其他范围及仅 GLOBAL IAM_MANAGER 不获权。范围由服务端确定，不允许覆盖 storeId/owner 或提交开通开关。

PUT 只接受 version、displayName、fulfillmentRules 和 reason=configuration_change。名称 1～64 Unicode 字符并去首尾空白，拒绝控制字符。三种草稿必须各一项，不允许缺失/重复/伪造方法。

- feeMinor/freeAboveMinor 为可空的 0～999999999999 整数分十进制字符串；null 表示未定，不是免费，显式 "0" 才是草稿零值。
- serviceDescription 可空、最多 500 字符，仅范围/时段文字说明，不是可执行围栏、时段或配送承诺。
- pickupAddress 仅 PICKUP 可非空、最多 200 字符；可留空，不证明已存在自提点或门店。

后台展示未配置、只读、无权、加载/失败/版本冲突状态，可重载和保存名称/三种草稿，返回审计编号。没有开通按钮。

## 事务与归属

Store 模块拥有 store/store_fulfillment_draft，其他模块只通过公开服务协作。首次保存预期 version=0，之后为当前聚合版本；名称、三条草稿、递增版本和脱敏成功审计同一事务提交。稳定预期版本作为去重令牌，同版本重复/并发最多一笔生效，其余 409，客户端重读后编辑，不自动覆盖。

写事务内调用 IAM authorizeInTransaction，按 IAM→主体→会话→store 锁顺序，Serializable 冲突整笔有限重试，无外部网络副作用。失败不留配置/成功审计；权限/版本拒绝单独留脱敏审计，不记录名称、费用全文、范围说明或地址。

数据库约束固定单范围、ONLINE、正版本、非空名称、方式唯一、费用非负/上限及自提地址方法限制；三方法完整性与规范化由应用服务保证。readInTransaction 供后续模块读取上下文，不暴露 ORM。

## 用户端与恢复边界

市集独立读取真实商城名称，资料失败有重试；商品由 Catalog 已发布目录读取（见 catalog spec），没有商品时为空，不以样例价格替代。搜索/车/结算未开放。不显示假门店/距离/已开通履约，也不请求定位。H5 同源开发代理；微信端必须显式配置受信 API 基址，缺失时拒绝相对 URL 请求。生产自定义基址只允许 HTTPS，拒绝凭据/查询参数；H5/适配器测试不证明微信合法域名或真机已验收。

追加迁移不 seed；空隔离 schema 全部迁移执行后整体 ROLLBACK，不改已有表。测试库发现已有配置/管理员拒绝覆盖；验收覆盖升级、权限/CSRF/字段、首建/更新竞争、审计失败回滚、数据库约束与 API 重启。回退应用保留数据、失败前向修复，不为测试清空用户配置。
