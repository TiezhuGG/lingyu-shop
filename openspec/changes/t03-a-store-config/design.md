# T03-A0：纯商城销售范围与基础设置

状态：A0 已实现并通过本地验收，当前能力见 [storefront 规格](../../specs/storefront/spec.md)，证据见 docs/progress.md。用户明确“暂时不用真实门店，保留功能，先只做成一个商城”，并补充快递、同城配送、自提规则仍需要。原 T03-A 拆为本批 A0（商城基础与三种履约规则草稿）和 A1（实际策略/营业/服务区校验与开通，实体门店可选）；T03-B 只依赖 A0，不被真实门店资料阻塞。此选择不免除 P1-B 的真实支付/履约/微信验收。

## 本批行为

- 单主体、单销售范围；store_id 是商品/价格/购物车与授权的稳定归属，不代表真实地址或实体仓。稳定范围 UUID 为 `00000000-0000-4000-8000-000000000001`，公开可读但不构成权限。
- 不自动创建 store 记录，不写入示例店名、地址或经营参数。未配置时公开返回范围编号、configured=false、displayName=null、version=0；后台授权运营填写商城显示名称后才首次保存。
- mode 固定 ONLINE。physicalStoreEnabled、checkoutEnabled 始终 false，enabledMethods 为空，不可通过 DTO 开启。EXPRESS / LOCAL_DELIVERY / PICKUP 三种方式均保留；前端显示规则待配置/未开通，不伪造可配送或可自提。商品仍是明确标记的示例，后续 T03-B/T05 才接商品/车。
- 后台可保存三种规则草稿：运费（整数分或未定）、免运门槛（整数分或未定）、服务范围/时段说明、自提地址（仅自提）。均可留空；不预设 0 元、全国包邮、配送半径或营业时间。草稿没有执行效力，不代替报价、地址范围判断或履约能力验证。快递与同城范围说明不是可执行地理围栏，自提地址不代表门店已开通。
- 后台提供名称读取/保存、未配置/只读/无权/加载失败/版本冲突状态。IAM_MANAGER 只管理账号与授权，不能因全局角色修改商城。现有 STORE_OPERATOR / STORE_READER 作用于该商城范围，角色枚举不变，不自动授予权限。
- 公开接口只输出销售范围与名称/未开通状态，不收集定位或客户地址，不公开自提地址/草稿费用，不决定生效的运费、服务区或营业政策。

## 表、接口与边界

Store 模块拥有 store 表及 store_fulfillment_draft 表：前者为 id(UUID)、display_name(1～64 字符去首尾空白)、mode=ONLINE、version>0、created_at/updated_at；后者为 store_id/method 联合主键、fee_minor/free_above_minor（可空非负 bigint）、service_description、pickup_address。三草稿与名称共享一个聚合版本。数据库 CHECK 固定唯一销售范围 ID、ONLINE 与非空名称；费用明确整数分，12 位十进制上限，自提地址只允许 PICKUP。扩多仓或实际开通需新规格/迁移；不新增库存、客户地址、可执行服务区或商品表。

GET /api/v1/app/storefront：游客只读销售范围、名称及三种履约的未开通状态，不公开草稿费用/地址/范围说明。
GET /api/v1/admin/storefront：需 store.read 和同一范围授权，返回三种完整草稿。
PUT /api/v1/admin/storefront：需 store.configure 和同一范围授权；只允许 version/displayName/fulfillmentRules/reason（configuration_change），三种草稿各一项，不接受 storeId/owner/开通开关或实体营业字段；成功返回审计编号。

首次保存预期 version=0；后续保存预期当前 version。事务内先调用 IAM 的 authorizeInTransaction，再读取/更新自己模块的表、递增版本并同事务追加审计。稳定预期版本是此配置命令的去重令牌；重试不重复生效，重复/过期版本返回 409，客户端重读，不自动覆盖。锁顺序沿用 IAM→主体→会话→store，Serializable 冲突整笔重试；不执行外部副作用。失败回滚不留配置/成功审计；权限/版本拒绝另外留脱敏审计，不记录显示名称或原始输入。

API/Worker 从 server-modules 公开服务复用；其他模块不直接写 store。OpenAPI 为单一 schema，前端只用生成契约。H5 开发代理同源 /api；微信端必须显式配置受信 API 地址，缺配置明确未连接，不以 H5 证据冒充真机。

## 验收与恢复

普通测试验证 DTO 白名单、名称规范化和只读能力开关；真实 PostgreSQL/API 验证未配置不写库、客户/匿名/错误范围/IAM 全局越权拒绝、只读与写权限、首建与重复/并发版本、审计/失败回滚、数据库约束、进程重启。后台真实 API 编辑与 H5 市集读取名称，H5 不请求定位且不显示门店模式；微信只构建，真机另验收。

追加迁移须在空库和既有库验证；不更改已部署迁移，不清库/卷。回退应用保留表，失败前向修复。测试只清理独立测试库内本批拥有的配置与随机测试身份，发现已有 store 记录拒绝覆盖；业务库不写商城配置。真实仓店功能留在 A1 设计与任务，不写成已实现能力。
