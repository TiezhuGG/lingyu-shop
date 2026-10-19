# 分类、固定 SKU、价目草稿与发布

## 能力与边界

当前为 ADR-003 的单 ONLINE 销售范围。先由有权限的运营保存商城名称，再创建分类/商品；不依赖真实门店，不自动 seed 分类、经营商品或价格。分类一级、最多 100 项，SPU 1～30 个固定包装 SKU。数量按包装整数件，不包含称重、自选套餐/组件、折扣/会员价、库存、搜索/分类过滤、购物车、图片资产/CMS 或交易。

SKU 包装单位 PIECE/PACK/BOX/BOTTLE/BAG 分别为件/包/盒/瓶/袋，编码为唯一大写字母数字/横线/下划线、3～48 字符。选项每 SKU 最多 3 轴，名称/值经 NFKC/trim 并按名称排序，轴相同且组合不重复。规范化后再次校验长度。ID/code/unit/options 一经创建不可变、不可删除，停用只影响下一次发布；新增规格使用新 ID/编码，新增规格轴需新 SPU，禁止将旧身份重解释为别的包装。

## 接口与权限

OpenAPI 为单一 DTO 来源。后台 `/api/v1/admin/catalog` GET 返回全部分类配置和一页商品草稿摘要，`/categories/{id}` PUT 保存分类，`/products/{id}` GET/PUT 读取/保存商品草稿；`/products/{id}/publish`、`/withdraw` POST 发布/下架。路径 ID 为规范 UUID，首次 PUT version=0，其余使用当前聚合版本与受控 reason；未知字段拒绝。读取 catalog.read、编辑 catalog.write、发布/下架 catalog.sku.publish 均需同销售范围授权，GLOBAL IAM 不代替业务权限。Cookie/Origin/CSRF 与实时撤权校验沿用 IAM。

公开 `/api/v1/app/products` GET 无需登录，仅返回已发布指针的快照及对应 Pricing 价目。公开与后台列表用 UUID 升序 keyset：默认 20、limit 为字符串 1～100、cursor 可选；响应 items/hasMore/nextCursor，不静默丢弃后续页。后台和公开均 no-store。用户端每次读取 20 项，显式加载更多，首屏/下一页失败可重试，不拿 fixture 填空。

## 草稿与发布规则

分类配置有版本、名称/排序/启用开关。修改/归档不修改旧发布的分类快照；归档阻止未来保存/发布使用该分类，不自动下架旧商品。需要隐藏商品时明确执行下架。

SKU 草稿售价可为 null（未定，不是免费），显式 `"0"` 为零价；其他金额为 0～999999999999 的十进制整数分字符串，数据库 bigint。发布前要求商城已配置、分类有效、至少一个启用 SKU 且启用 SKU 全部有售价。公开只返回启用的发布 SKU、固定单位/选项、priceMinor 和与商品发布 version 相同的 priceVersion。没有折扣或划线价假数据。

保存草稿、发布、下架各递增聚合版本；同版本并发/重放至多一笔成功，其他 409。发布追加商品/分类/SKU 快照与独立价目版本后原子切换指针，历史没有覆盖接口。后续草稿名称/说明/价格/分类及 SKU 停用均不污染公开快照。下架清空公开指针，保留草稿、SKU 身份与全部历史。后台显示公开名称与逐 SKU 当前价/目标价，并在提交前二次核对；未保存编辑时禁止发布/下架，冲突不自动覆盖。

## 所有权、事务、审计与恢复

Catalog 拥有 catalog_category/product/sku/publication/published_sku，Pricing 拥有 sku_price_draft/sku_price_version；其他模块通过公开服务、同一 TransactionContext 协作，不跨模块直接改表。Pricing 表通过 SKU/发布关系归属于当前销售范围，金额不藏在 JSON 快照。Store 通过 readInTransaction 提供配置事实。

写事务按 IAM 事务锁→管理员/会话行→Catalog 聚合→排序 SKU 价目执行，Serializable 结构化冲突整笔有限重试，唯一冲突转 409。聚合变更与审计同事务；每项草稿改价审计包含前后整数分、SKU/商品/版本，每次发布价目也留整数分与版本，不记录名称、说明、选项全文或凭据。审计失败回滚商品、价目、指针与成功审计；权限/版本拒绝另记脱敏记录。没有资金扣款、库存预占或外部事务副作用。

迁移只追加七张 Catalog/Pricing 表，无 seed，不改变原有经营资料。FK/唯一/CHECK 校验单位/金额/正版本/代码/规格键、发布指针及 SKU 同商品归属；业务服务校验选项语义与身份不可变。回退旧应用保留新表/历史，前向修复；不 reset/drop/删卷。生产备份恢复/迁移权限另验收。

用户端真实列表明确 inventoryStatus=NOT_CONNECTED/purchasable=false/checkoutEnabled=false；快递、同城、自提仍未开通。H5 与编译产物不是微信真机或经营上线证据。
