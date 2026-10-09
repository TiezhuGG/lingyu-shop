# 第一期功能基线与 FLOW-01 待实现规格

状态：设计提案，尚未实施。本文件不放入 specs 当前能力目录，也不代表 OpenSpec CLI 已接入。原型快照见 docs/reference，任务和验收见 docs/tasks.md、docs/acceptance/prototype-mapping.md。

## Requirement：第一阶段范围可追踪

系统 SHALL 提供发现、市集、我的三个主入口。原型静态展示对应的功能补齐按映射表实现；演示交易须显式标记，真实资金功能通过渠道验收后才启用。第一阶段只使用单经营主体、单仓、固定包装 SKU；社区图文、审核、点赞/关注/举报，基础券与服务菜单纳入范围。

Scenario：第二阶段入口尚未实施
- Given 第一期正在开发
- When 查看任务与用户端导航
- Then 不以直播、付费会员、储值、AI 的空入口宣称一期完成
- And P2 对应任务仍记录未实现，保留后续范围

## Requirement：分类商品发布及公开查询

Catalog SHALL 维护分类、SPU、SKU、单位与上下架，Pricing SHALL 提供当前仓价目版本，Store SHALL 提供营业与取货方式。管理员只可操作授权仓；公开列表只返回发布且符合当前仓查询条件的商品。购物车库存提示不等于预占。

Scenario：后台发布
- Given 授权管理员在仓 A 创建有效分类、固定包装 SKU 和非负整数分价格
- When 发布商品
- Then 成功变更与审计同事务保存
- And 用户端仓 A 能读到相同 SKU、单位、价格版本

Scenario：越权与冲突
- Given 仓 A 管理员或过期版本的编辑表单
- When 操作仓 B 或覆盖更新过的价格
- Then 越权返回拒绝，版本冲突返回 409
- And 不修改目标价格，不泄露私人数据

## Requirement：购物车由服务端保存

Cart SHALL 对已登录用户按 user/store 保存车与单调递增 version。明细唯一键为 cart/SKU/已规范化选项，quantity 为绝对正整数；零表示删除的接口语义需在 DTO 明确。所有 owner 从会话获取，不接受客户端总价作为事实。

Scenario：持久化
- Given 用户 A 将仓 A 的某 SKU 加入购物车
- When 服务重启或用户重新登录
- Then 恢复相同车内容和版本，并重新查询当前可售状态及价格

Scenario：并发修改
- Given 两个设备持有同一 cartVersion
- When 同时提交不同绝对数量
- Then 至多一个以该版本成功，另一返回 CART_VERSION_CONFLICT
- And 客户端重新加载，不静默覆盖或重复叠加

Scenario：失效商品与重复名称
- Given 同名两个 SKU，或车中某 SKU 后续下架
- When 浏览和加购
- Then 以 SKU ID 区分明细，下架显示原因并禁止结算
- And 不以名称匹配导致合并错误

Scenario：游客合并重试
- Given 游客本地临时车及已有用户车
- When 登录后使用稳定 mergeKey 合并并因网络超时重试
- Then 同一 mergeKey 只合并一次，超限/下架明细返回原因
- And 合并成功后才清除本地副本，拒绝登录不丢失临时车

## Requirement：三入口与内容发布具有真实状态

系统 SHALL 在主入口切换时保留合理的滚动/筛选/购物车状态；只公开已通过审核的内容版本。点赞与关注采用设置目标状态而非重复 toggle；图片归属和可用状态在提交时校验。

Scenario：未审内容
- Given 作者提交草稿，或修改已审核正文
- When 游客读取发现流
- Then 未审版本不可公开，审核必须针对指定版本
- And 重复提交、重复点赞不产生第二份记录或重复计数

## Requirement：一期资产展示不造假

券数、等级、进度、余额 SHALL 来自用户真实资料或明确隔离的演示资料。未开通钱包时余额显示零和能力说明；不建立假充值接口。付费会员、积分抵扣的交易规则在二期独立设计。

## FLOW-01 数据/API 设计入口

计划表：store、category、product、sku、sku_option、store_sku_price、cart、cart_item、audit_log、identity/session 与 IAM 相关表。字段/约束/索引/外键/软删除政策在 T02/T03/T05 开工时给出实际迁移，不能从本清单生成全项目 schema。

计划接口：后台仓店/分类/商品/SKU/价格草稿与发布；app stores/products；app cart 查询/明细更新/清空/游客合并。路径遵循 /api/v1/app 与 /api/v1/admin，响应含 requestId，version 与 *Minor 契约统一。生成客户端/DTO 探针在 T01-D 完成。

交付证据：后台发布操作、公开读取响应、登录车写读、进程重启后的车、越权失败、重复合并、车版本冲突、变价/下架反馈；H5 和微信开发工具/真机分别标注。真实数据集成使用隔离 PostgreSQL，fixture 只证明视觉和契约消费者。

恢复：首次迁移可回退应用但不自动删除业务表；已写数据保留并前向修复。业务 schema 与 engineering_probe 专用 PoC 数据库隔离；所有 seed 标记测试来源，生产不得自动导入。
