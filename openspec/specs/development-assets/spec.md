# 开发环境 CMS 图片资产（T04-A1）

仅本机 development/test 使用，显式 ASSET_LOCAL_DIRECTORY 启用；无配置返回503，production 配置此目录拒绝启动，运行时生产门禁同样拒绝。此能力不提供生产存储、恶意内容扫描、社区图文审核、公开文件/CDN 或图片 CMS 发布。

## 后台与接口

后台“开发图片资产”支持本人资产分页、选择PNG/JPEG、票据/上传、解码确认、私有预览、撤销确认。所有接口在 `/api/v1/admin/assets`：GET 列表（before UUID，每页10条）、POST upload-tickets、GET :id、POST :id/bytes、POST :id/confirm、POST :id/revoke、GET :id/content。Cookie/Origin/CSRF 及事务内实时权限检查沿用 IAM。asset.read/upload/revoke 按同商城授权；STORE_OPERATOR 可操作，STORE_READER 只读，GLOBAL IAM 不获业务权。票据及私有图只允许创建它的管理员访问，不按请求 owner/store 查询资源。

AssetUpload 由 Asset 拥有，关联管理员与商城。仅 CMS_IMAGE，PNG/JPEG，声明大小1～2097152字节与小写SHA256；10分钟票据绑定随机 uploadId、声明与已认证归属，不接受外部文件名、路径、key、归属或状态字段。相同ID/相同属主/相同输入幂等返回，异输入409、错属主404。接口响应不返回存储key、路径、摘要或base64。uploadId仅为幂等资源标识，不是脱离登录的公开上传凭证。

## 状态与文件保护

ISSUED→STORED→DEVELOPMENT_READY；可撤销至REVOKED，不能恢复。未确认票据过期后拒绝上传/确认；已确认图片保留资格至撤销。上传校验canonical base64、实际字节数/摘要/基本签名；确认通过 ImageInspectionPort 的开发实现完整解码、限定4096边长/1600万像素、拒绝多页与损坏图，并重新编码PNG移除元数据/尾随载荷。处理结果仍 developmentOnly=true，不产生生产READY。

解码依赖sharp0.35.5及锁定的原生可选包（本机Node24.22.1验证）；不是杀毒/内容审核服务。仅最多两个上传/解码工作同时执行，其余429。仅已确认本人图片可读取，读取经过私有文件ACL/链接/摘要检查，并在读完后重新核对会话和资产版本；响应为image/png、nosniff、no-store，无公共静态目录。重新编码后的图片不保留原始MIME或EXIF。

## 事务与恢复

IAM→会话→Asset，Serializable有限整笔重试。文件/解码均在事务外，前后分别鉴权及状态复核；撤销或撤权后在途操作不能恢复资格。状态变化与审计同事务，审计不记录文件正文、key、摘要、凭据；重复成功请求不重复改变状态或增加成功审计。

每商城最多100张票据、累计声明64MiB；包含已过期/撤销的记录，是开发硬上限。无自动配额回收/文件清理。失败确认、审计回滚或进程中断可留下私有孤儿，不能绑定；不可自动删除内容寻址文件来补偿，避免误删其他引用。崩溃临时文件、保留治理及真实扫描另行验收。

CMS 后续通过 requireDevelopmentImageInTransaction 校验同商城/用途/开发状态，不跨模块改表；该方法只检查元数据，不在事务内读文件。C2 发布、回退及公开读取还需按其规格再次校验当前资格，不能将本批视为图片Banner已经实现。

第八迁移只追加资产表与约束/FK/索引，不seed。回退应用保留表和文件，前向修复；不得通过清库、删卷或放宽权限恢复。API JSON传输上限3MiB，解码前合同仍限制2MiB；其他DTO长度/字段约束不变。真实生产存储、Linux原生解码/ACL回归和微信真机不由本机验证替代。
