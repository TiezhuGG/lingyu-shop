# 本机 Docker / WSL 恢复

## 当前运行方式

用户已处理 Windows/WSL/Docker 启动问题。当前环境操作按下方项目命令进行；后面的 2026-10-07 诊断为历史记录，不再代表当前阻塞。不要再按旧诊断重复重装系统或 Docker。

PostgreSQL/Redis 使用本项目专用 Compose 和命名数据卷。镜像补丁版本和 digest 固定在 compose.yaml；应用端口为 loopback PostgreSQL 15432 / Redis 16379。准备被忽略的根 `.env`（参考 `.env.example`），随机生成本地密码，POSTGRES_PASSWORD 与 POC_DATABASE_URL 中密码一致。首次初始化后的密码保存在数据库卷中，仅改 .env 不会修改已有数据库账户密码；认证失败先核对配置，不能删除卷解决。

```text
docker compose --env-file .env -f infra/containers/compose.yaml up -d --wait
docker compose --env-file .env -f infra/containers/compose.yaml ps
pnpm.cmd db:generate
pnpm.cmd db:poc
pnpm.cmd redis:poc
docker compose --env-file .env -f infra/containers/compose.yaml stop
```

最后一行是保留数据卷的正常停止命令，需要停止时才执行。重新启动使用 up -d --wait。`redis:poc` 会短暂停止/启动独立 Redis，只操作自己的随机键；不要在共享业务环境运行。PostgreSQL 工程探针只使用 lingyu_shop_poc，拒绝远程或业务数据库。

PoC 若发现 91001/91002 已存在会拒绝覆盖：先确认没有探针进程运行，再通过本机 psql 检查这两行的归属与上次失败原因；只有确认是工程遗留且用户授权清理时才处理。正常脚本会清理自身数据，不使用 DROP DATABASE、迁移 reset、FLUSHDB 或 down -v。

镜像网络故障先区分引擎与注册表：docker info 有服务端但 pull 的 auth.docker.io TLS 超时是下载链路问题。保留卷与缓存、使用已有受信任代理后重试；不关闭证书验证、切换未知镜像源或删除数据。固定 digest 为内容校验依据。

## 历史诊断（2026-10-07）

2026-10-07 实际检测：Docker CLI 29.8.2、Compose 5.5.1；Windows build 22000.708。CLI 能运行但 Linux 引擎管道不存在。`docker desktop start` 报安装注册信息缺失；直接启动已安装入口后引擎仍不可达。WSL --version/--list --verbose 不可用，--status 失败；DISM 检查返回错误 740，需系统管理员。

[Docker 当前 Windows 要求](https://docs.docker.com/desktop/setup/install/windows-install/) 列明 Windows 11 build 22631+、WSL 2.1.5+。本机不满足当前支持基线，不以重复启动或手工伪造注册键解决。

需要在本机处理的步骤（尚未执行/验证）：

1. 先保存工作，通过 Windows Update 升级到受支持 Windows 11 版本；重启由用户自行安排。
2. 以 Windows 管理员终端按 [微软 WSL 安装说明](https://learn.microsoft.com/en-us/windows/wsl/install) 安装/更新 WSL 2；按提示处理必要重启。当前旧引导程序不接受 --no-distribution，不重复照搬该参数。
3. 检查 `wsl --version`，确认版本达到 Docker 要求，及 BIOS/UEFI 虚拟化可用。
4. 启动现有 Docker Desktop；若安装状态仍异常，用官方安装器修复/重装并保留现有数据，避免 Factory Reset 或卸载数据选项。
5. `docker info` 应返回服务端信息，随后回到 T01 创建专用 PostgreSQL/Redis 开发容器并运行真实验证。

本批未删除镜像/容器/卷、未编辑注册表、未自动重启；工具 sandbox 的 require_escalated 只移除工具限制，不授予 Windows 管理员权限。系统功能尚未成功启用，数据库 PoC 未通过。

## 历史项目容器准备（现已由上方流程替代）

infra/containers/compose.yaml 使用独立 lingyu-shop-dev 项目及数据卷，端口只绑定 loopback：PostgreSQL 15432、Redis 16379。PostgreSQL 库名固定 lingyu_shop_poc，迁移与测试只针对工程探针。当前 postgres:17/redis:8.2 为开发系列标签，真实运行后必须核实补丁版本、支持/许可证并固定 digest，尚不算数据库锁版通过。

引擎恢复后准备根 .env（不提交）：POSTGRES_PASSWORD 填本地值，POC_DATABASE_URL 对应用户 lingyu_dev、端口 15432、库 lingyu_shop_poc。然后执行以下待验证命令：

```text
docker compose --env-file .env -f infra/containers/compose.yaml up -d --wait
pnpm db:generate
pnpm db:poc
docker compose --env-file .env -f infra/containers/compose.yaml exec redis redis-cli ping
```

不要执行 down -v 或删除卷作为日常停止方式；停止容器使用 stop，保留数据。上述启动和真实探针本批均未成功运行。
