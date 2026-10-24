# T03-C0-F1：Windows 私有图片暂存兼容

本批修复 T04-A 之前的本机存储依赖，不交付上传接口、资产 READY、CMS 图片或真实扫描。生产继续拒绝。

## 原因与行为

Windows 的 `/` 按当前盘解析，原实现拿解析后的路径与原始 root 比较会漏拒绝。临时目录通常使用 ADMINI~1，realpath 在子目录上展开为 Administrator，原字符串比较误拒绝合法目录。Windows 不提供 O_NOFOLLOW，不能将未定义常量直接当作链接保护。

仅支持本地盘绝对路径；拒绝根、相对盘路径、UNC/设备路径。检查输入路径及其祖先，拒绝 symlink/junction，再使用 canonical 路径。Linux 继续属主/mode/O_NOFOLLOW 校验。Windows 新建目录在任何图片写入前设置保护 DACL，仅当前进程用户与 SYSTEM；已存在目录只验证，不改权限。目录/文件 allow ACE 出现其他 SID 或目录继承未关闭则失败。只在新建暂存目录设置 ACL，不改父目录、系统策略或既有目录权限。

读取先 lstat 拒绝链接，再打开，以 bigint 的 dev/ino 对比路径与句柄身份，验证后才读字节；Windows 另验证文件 ACL。保持大小/摘要校验、原子硬链接去重和固定脱敏错误；不覆盖损坏文件。新建目录后崩溃最多留下空目录；无法证明权限时失败关闭。

## 验收与恢复

原两项测试必须通过，不跳过；新增盘根/路径、短路径展开、目录 junction/祖先 junction、文件 symlink、宽松目录与文件 ACL 拒绝、重复与并发写入、篡改拒绝。测试仅操作随机临时目录，finally 清理自身文件。全工程 build/typecheck/check/普通测试。Linux 代码路径需独立运行或明确未复验。

无依赖、数据库、HTTP、配置或自动启动变化。回退代码不自动删除文件或重写 ACL；旧文件仍 UNVERIFIED，Windows 权限不符合则拒绝，人工选择新私有目录，不放宽安全检查来恢复。
