# T01-C：真实数据环境与事务验证

## 执行边界

保留 PostgreSQL 17 / Redis 8.2 技术方向，使用独立 Compose 项目、数据卷和 loopback 15432/16379。随机开发密码仅写入被忽略的 .env，不输出连接凭证；只接受本机 lingyu_shop_poc 专用数据库。启动后读取镜像 digest 与实际补丁版本，再将 Compose 固定为补丁标签加 digest。禁止清库、删除数据卷或 Factory Reset。

## PostgreSQL 探针

先迁移部署，再在工程表原子创建 91001/91002 两行；已有同 ID 时拒绝运行，不覆盖旧数据。仅清理本次成功创建的行，清理失败必须报告。所有并发任务都结束后才进入清理，避免失败时还有事务写回。探针可重复执行，业务表与资金规则不在本次范围。

验证参数化 FOR UPDATE、20 请求竞争 1 份、异常回滚、非负约束、Prisma 双事务真实死锁，以及 Serializable 下读改写冲突。重试整个 $transaction，最多 3 次并退避；只允许 P2034，或原生查询 P2010 中结构化 SQLSTATE 40001/40P01；不按异常消息文本猜测或无限重试。先写入再引发死锁，最终每行只包含已提交的两次写入，以证明失败尝试已回滚。连接池最大 2，异常后连接仍可使用。

实测 Prisma 7.10 的原生查询死锁返回 P2010，SQLSTATE 位于 `meta.driverAdapterError.cause.originalCode`，同层 kind 为 TransactionWriteConflict；重试器必须支持这一结构，而非仅检查顶层 P2034 或 meta.code。脚本中的重试器只服务工程 PoC；T01-D 再将经验证规则接入 server-modules 的生产事务边界。使用替身的脚本测试只证明输入保护、重试分类与次数控制，不能证明数据库并发语义。

## Redis 验证

检查 PING、实际版本、AOF/noeviction 配置；使用随机工程键写入并 WAITAOF，再正常重启 Redis，确认键恢复，最后只删除本次键。验证停机时本地连接不可用、重启后恢复。不得 FLUSHDB/FLUSHALL；不把正常重启测试当断电灾备。缓存不承担资金事实。

## 后续门槛

环境与上述真实探针通过才完成 T01-C；数据库迁移/事务规则为 T01-D 前置。远程 CI、生产 HA、备份灾备、业务权限、商品发布仍由各自任务验收。
