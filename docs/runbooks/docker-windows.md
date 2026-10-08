# 本机 Docker / WSL 恢复

2026-10-07 实际检测：Docker CLI 29.8.2、Compose 5.5.1；Windows build 22000.708。CLI 能运行但 Linux 引擎管道不存在。`docker desktop start` 报安装注册信息缺失；直接启动已安装入口后引擎仍不可达。WSL --version/--list --verbose 不可用，--status 失败；DISM 检查返回错误 740，需系统管理员。

[Docker 当前 Windows 要求](https://docs.docker.com/desktop/setup/install/windows-install/) 列明 Windows 11 build 22631+、WSL 2.1.5+。本机不满足当前支持基线，不以重复启动或手工伪造注册键解决。

需要在本机处理的步骤（尚未执行/验证）：

1. 先保存工作，通过 Windows Update 升级到受支持 Windows 11 版本；重启由用户自行安排。
2. 以 Windows 管理员终端按 [微软 WSL 安装说明](https://learn.microsoft.com/en-us/windows/wsl/install) 安装/更新 WSL 2；按提示处理必要重启。当前旧引导程序不接受 --no-distribution，不重复照搬该参数。
3. 检查 `wsl --version`，确认版本达到 Docker 要求，及 BIOS/UEFI 虚拟化可用。
4. 启动现有 Docker Desktop；若安装状态仍异常，用官方安装器修复/重装并保留现有数据，避免 Factory Reset 或卸载数据选项。
5. `docker info` 应返回服务端信息，随后回到 T01 创建专用 PostgreSQL/Redis 开发容器并运行真实验证。

本批未删除镜像/容器/卷、未编辑注册表、未自动重启；工具 sandbox 的 require_escalated 只移除工具限制，不授予 Windows 管理员权限。系统功能尚未成功启用，数据库 PoC 未通过。

## 项目容器准备（未启动）

infra/containers/compose.yaml 使用独立 lingyu-shop-dev 项目及数据卷，端口只绑定 loopback：PostgreSQL 15432、Redis 16379。PostgreSQL 库名固定 lingyu_shop_poc，迁移与测试只针对工程探针。当前 postgres:17/redis:8.2 为开发系列标签，真实运行后必须核实补丁版本、支持/许可证并固定 digest，尚不算数据库锁版通过。

引擎恢复后准备根 .env（不提交）：POSTGRES_PASSWORD 填本地值，POC_DATABASE_URL 对应用户 lingyu_dev、端口 15432、库 lingyu_shop_poc。然后执行以下待验证命令：

```text
docker compose --env-file .env -f infra/containers/compose.yaml up -d --wait
pnpm db:generate
pnpm db:poc
docker compose --env-file .env -f infra/containers/compose.yaml exec redis redis-cli ping
```

不要执行 down -v 或删除卷作为日常停止方式；停止容器使用 stop，保留数据。上述启动和真实探针本批均未成功运行。
