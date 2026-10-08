# 开发环境与方式

## 实测基线

2026-10-07，Windows，项目目录 `C:\Users\1\Desktop\lingyu-shop`。

| 工具 | 实测版本 | 路径/说明 |
|---|---|---|
| Node.js | 24.21.0 | `D:\node-v24.21.0-win-x64\node.exe` |
| pnpm | 12.9.1 | `D:\node-v24.21.0-win-x64\pnpm.cmd` |
| Git | 2.56.0.windows.1 | `D:\Git\cmd\git.exe` |
| Shell | cmd.exe 可用 | PowerShell 启动失败：系统不完全支持 CET。当前验证使用 cmd.exe |

根 package.json 固定 Node 与 pnpm 基线，pnpm-workspace.yaml 启用 engineStrict、saveExact，.npmrc 保留对应设置。pmOnFail: ignore 禁用包管理器自动下载，仍由 engines.pnpm 约束版本；存储使用本项目 .pnpm-store（Git 忽略）。当前无第三方依赖；框架、数据库、Redis、微信基础库及其支持周期/许可证/兼容矩阵尚未验证。上述版本是本机实测基线，不代表整套框架兼容性已通过。

## 已验证操作

在根目录执行：

```text
pnpm install --frozen-lockfile
pnpm check
pnpm -r list --depth -1
git status --short
git diff --check
git diff
```

首次初始化使用 `pnpm install` 生成 pnpm-lock.yaml，后续使用冻结安装。`pnpm check` 只验证工程结构与运行时，不是业务测试或应用构建。

本次实际生成锁文件使用 `pnpm --pm-on-fail=ignore install --offline --store-dir .pnpm-store`；随后离线冻结安装以及标准 `pnpm install --frozen-lockfile` 均通过。安装命令在桌面代理受限环境中曾因 `pnpm-store-operation-locks` 拒绝访问失败；提升执行权限后通过。普通用户终端安装权限尚未单独验证。结构检查和列包命令在受限环境直接通过。

初始自动解析 pnpm 触发 registry.npmmirror.com 连接失败，未验证联网依赖下载。旧 managePackageManagerVersions 设置被本机 pnpm 忽略，已移除；现采用 [pnpm 官方配置说明](https://github.com/pnpm/pnpm.io/blob/main/docs/settings/cli.md) 的 pmOnFail 设置并实测通过。

## 初始化时的启动、测试和构建边界（历史记录）

当前 4 个应用与 4 个共享包仅含目录及 manifest，没有运行入口、框架依赖、dev/test/build 脚本。当前无应用可启动；未运行应用测试、应用构建、数据库迁移或微信真机测试。不得使用空脚本伪装成功。

.env.example 只有数据库和 Redis 占位配置，尚未连接服务。未来复制到本地 .env 后填写本地开发值，不提交密钥。ORM 未选定实际版本，不预生成 schema 或迁移 API。

框架接入批次需验证并记录每个应用的安装、启动、测试与构建命令，再同步 AGENTS.md。OpenSpec CLI 未安装；规格目录暂使用 Markdown。

## T01 续批：当前工程命令

当前仍无商城业务，仅框架入口。框架与版本取舍见 ADR-001。已验证：

```text
pnpm install --frozen-lockfile
pnpm peers check
pnpm check
pnpm typecheck
pnpm build
pnpm --filter @lingyu/miniapp build:h5
pnpm test
```

`pnpm test` 使用编译后制品，先执行 build。根 build 包含微信小程序、后台、API、Worker 和三个源码共享包；config 为直接使用的配置，无虚假构建脚本。本次 peer 检查无问题；DCloud 间接依赖 phin 有弃用告警，未据此宣称依赖安全审核通过。

开发启动（已验证能启动）：

| 命令 | 地址/行为 |
|---|---|
| `pnpm dev:admin` | http://127.0.0.1:5173，后台工程页 |
| `pnpm --filter @lingyu/miniapp dev:h5` | http://127.0.0.1:5174，小程序 H5 工程入口 |
| `pnpm dev:api` | http://127.0.0.1:3000/health，工程健康检查，无数据库 readiness |

API/Worker dev 先编译、再监视 dist；修改源码需另开终端执行 `pnpm --filter @lingyu/api build` 或对应 worker build。不宣称源码热重载。Worker 编译入口已由集成测试验证；持续运行/dev 模式尚未单独验证。

小程序微信产物在 apps/miniapp/dist/build/mp-weixin，H5 在 apps/miniapp/dist/build/h5；无 AppID，未验证开发者工具导入、微信真机、账号能力或上传。`dev:miniapp` 已配置但尚未实测微信 watch，不列作已验证命令。

代理受限环境中构建/开发服务需要允许编译子进程，否则可能 spawn EPERM；提升执行权限后本批验证通过，不能据此要求关闭系统安全防护。

Docker CLI 29.8.2/Compose 5.5.1 已检测；引擎未运行且启动缺少安装注册信息。没有数据库/Redis 环境，T01-C 的真实验证尚未实施。GitHub Actions 配置已建立，远程尚未运行；本批不推送。

## Prisma 工程探针（部分验证）

Prisma/client/adapter 7.10.0，pg 8.23.1 同版锁定；`pnpm db:validate`、`pnpm db:generate` 已通过。generated 客户端不提交；schema 和工程迁移入库。Prisma 必需配置位于根 prisma.config.ts，url 已从 schema 移出，使用 adapter-pg 接入运行时。

`pnpm db:poc` 已配置但尚未完成真实执行；目前因缺少 POC_DATABASE_URL 失败。只接受本机 lingyu_shop_poc 专用库，可能写入/更新/删除工程探针记录 91001/91002；不能承载业务数据。没有测试订单表、库存账本或支付模拟。真实数据连接、迁移、锁和重试均待环境恢复后验证。

Docker 排障实际证据与系统操作限制见 [运行手册](runbooks/docker-windows.md)。本机 Windows build 22000.708，需要先处理 Docker 当前支持要求；提升工具执行权限无法替代 Windows 管理员令牌。

项目 Compose 文件的 `docker compose -f infra/containers/compose.yaml config --no-interpolate --quiet` 已通过，证明结构可解析，不证明容器可启动。端口、专用库和待验证启动步骤见运行手册；镜像目前使用开发系列标签，补丁版本及 digest 固定尚未完成。
