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

## 启动、测试和构建边界

当前 4 个应用与 4 个共享包仅含目录及 manifest，没有运行入口、框架依赖、dev/test/build 脚本。当前无应用可启动；未运行应用测试、应用构建、数据库迁移或微信真机测试。不得使用空脚本伪装成功。

.env.example 只有数据库和 Redis 占位配置，尚未连接服务。未来复制到本地 .env 后填写本地开发值，不提交密钥。ORM 未选定实际版本，不预生成 schema 或迁移 API。

框架接入批次需验证并记录每个应用的安装、启动、测试与构建命令，再同步 AGENTS.md。OpenSpec CLI 未安装；规格目录暂使用 Markdown。
