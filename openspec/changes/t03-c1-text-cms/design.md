# T03-C1 纯文本内容纵向交付

依赖 T02-B/T03-B/ADR-002/003，沿用单 ONLINE 销售范围。仅 STORY/TERMS/PRIVACY 固定页码，MARKET/图片/Banner/促销区留 C2。没有默认故事、协议或隐私正文；功能开发不代表正式文案审核或用户同意记录。

CMS 自有 cms_text_page（按 store_id/page_code 唯一的当前草稿、聚合版本、公开指针）、cms_text_revision（不可覆盖的发布快照，回退来源版本）。读取不写入；保存需商城已配置，通过 Store 公共接口读取，不改 Store 表。标题最多80字，正文最多12000字、纯文本，允许换行/制表符，拒绝危险控制字符；空草稿可保存，但空白标题/正文不可发布。两端均插值渲染，不使用 v-html/rich-text，不解析 HTML/Markdown/外链或动态路由。

新增 cms.read/write/publish 同销售范围权限：运营可读写/发布，只读可读，GLOBAL IAM 和其他范围不代替业务权限。复用 Cookie、Origin、CSRF、事务内实时授权。Controller 只做边界转交。保存 version=0 首建，保存/发布/回退/撤下均递增同一聚合版本；同版本重放或并发至多一次生效，其余409。非法页码/未知字段拒绝，不接受 actor/store_id。

拟定接口：后台 GET/PUT /api/v1/admin/cms/{pageCode}，POST /publish、/rollback、/withdraw；公开 GET /api/v1/app/cms/{pageCode}。公开只返回 published 快照或 null，绝不返回草稿。后台历史每页10条、版本降序、before游标，有后续页标识；快照包含 version/title/body/publishedAt/sourceVersion。回退明确目标历史版本，重新校验并复制为新发布版本；不移动旧指针冒充回退，不改当前草稿。撤下清空指针，保留草稿/历史。所有响应 no-store。

锁顺序 IAM 事务锁→管理员/会话行→CMS 聚合，Serializable 冲突整笔有限重试，唯一冲突转409。保存/发布指针/历史和脱敏审计同事务；失败全部回滚。审计只存范围/页码/前后版本/回退来源/字符数/受控原因，不存正文/凭据。不得在事务内调网络或文件系统。

追加第七迁移，不改既有迁移；范围、页码、长度、正版本、公开指针、历史来源有数据库约束/FK。空schema全量与现存库升级均验收；回退应用保留新表/历史，失败前向修复，不drop/reset或删卷。生产发布与正式内容授权另行确认。

验收：DTO/控制字符/未知字段；真实PG/API空态无seed、鉴权/CSRF/跨范围、空草稿拒绝发布、版本竞争、草稿隔离、历史分页、指定版本回退新增快照、撤下/重启恢复、审计失败回滚、撤权；后台实际预览/发布/回退与H5阅读，XSS按文字显示，不跳任意路由。测试只清理随机身份和已确认空前置下的自有CMS页。微信真机/正式文案/C2均不借此结项。
