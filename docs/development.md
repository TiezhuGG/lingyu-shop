# 开发环境与方式

## 实测基线

当前运行要求仍以根 package.json 的 Node 24.21.0 / pnpm 12.9.1 为准。Linux 上已安装的 Node 24.22.0 / pnpm 12.14.0 不替代锁定基线；本地开发请在对应终端切换到锁定版本，不能靠关闭 engines 校验当作兼容验收。下表中的 Windows 路径是历史环境。

原始实测日期 2026-10-07；当前 Linux 工作区为 `/home/lhf/桌面/lingyu-shop`。下表及 Windows 路径仅保留历史记录，当前运行时要求与工程命令以本页后续章节、根 package.json 为准；批次证据只写入 progress。

| 工具 | 实测版本 | 路径/说明 |
|---|---|---|
| Node.js | 24.21.0 | package.json 强制版本；本批默认 shell 为 24.12.0，已在忽略的 `.local-tools` 下载官方归档、校验 SHA-256 后仅用于本批验证，未修改系统 Node |
| pnpm | 12.9.1 | 项目要求版本；本批通过同版本 CLI 在上述 Node 24.21.0 运行 |
| Git | 2.56.0.windows.1 | `D:\Git\cmd\git.exe` |
| Shell | PowerShell 当前可用，cmd.exe 为历史替代 | 旧批次PowerShell曾因CET启动失败；当前pnpm使用.cmd入口避免脚本策略限制 |

根 package.json 固定 Node 与 pnpm 基线，pnpm-workspace.yaml 启用 engineStrict、saveExact，.npmrc 保留对应设置。pmOnFail: ignore 禁用包管理器自动下载，仍由 engines.pnpm 约束版本；存储使用本项目 .pnpm-store（Git 忽略）。框架依赖已接入并留有本地兼容验证，Prisma探针已接入；真实 PostgreSQL/Redis 已通过工程探针；微信真机、支持周期与安全审核尚未完成。安装版本不代表全部运行语义已验证。

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

初始化时4个应用与4个共享包仅含目录及manifest，没有运行入口、框架依赖、dev/test/build脚本。该状态已被T01续批替代；以下段落保留历史背景，不是当前启动方式。

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

`pnpm test` 使用编译后制品且不会自动build，执行者必须先运行 `pnpm build`。根 build 包含微信小程序、后台、API、Worker 和四个源码共享包；config 为直接使用的配置，无虚假构建脚本。历史 peer 检查无问题；DCloud 间接依赖 phin 有弃用告警，未据此宣称依赖安全审核通过。

当前Windows若 `pnpm` 被PowerShell脚本策略拒绝，使用已安装的 `pnpm.cmd`，无需修改系统执行策略。受限代理环境中原生进程可能异常退出，必要时经权限流程在沙箱外验证；不能将无输出视为Git干净或测试通过。实际批次结果写入progress。

开发启动（已验证能启动）：

| 命令 | 地址/行为 |
|---|---|
| `pnpm dev:admin` | http://127.0.0.1:5173，管理员登录/权限与审计后台 |
| `pnpm --filter @lingyu/miniapp dev:h5` | http://127.0.0.1:5174，小程序 H5 三入口界面预览 |
| `pnpm dev:api` | http://127.0.0.1:3000/health，/health/live 存活，/health/ready 数据库就绪 |

API/Worker dev 先编译、再监视 dist；修改源码需另开终端执行 `pnpm --filter @lingyu/api build` 或对应 worker build。不宣称源码热重载。Worker 编译入口已由集成测试验证；持续运行/dev 模式尚未单独验证。

小程序入口为发现/市集/我的原生 tab 页面。当前仅显示已标记的示例图文与商品；开发模式顶部“状态预览”可检查加载/空白/错误和重试，生产构建隐藏该控制但保留示例标记。搜索、登录、加购、结算、订单与生活服务尚未开放；没有新增环境变量或 API 配置要求。视觉 CSS 由 `@lingyu/ui-tokens/theme.css` 提供，版本及原启动命令不变。

小程序微信产物在 apps/miniapp/dist/build/mp-weixin，H5 在 apps/miniapp/dist/build/h5；manifest 中的微信 AppID 尚未配置，未验证开发者工具导入、微信真机、账号能力或上传。`dev:miniapp` 已配置但尚未实测微信 watch，不列作已验证命令。

### 微信开发者工具：找不到 app.json

uni-app 源码不能直接作为原生微信小程序编译；`app.json` 由 uni 编译生成，不在仓库根目录或 `src` 中手写。根 `project.config.json` 的 `miniprogramRoot` 指向 `apps/miniapp/dist/build/mp-weixin/`，可以导入仓库根目录进行构建产物预览：

1. 在仓库根目录运行 `pnpm.cmd --filter @lingyu/miniapp build`，等待 Build complete。
2. 微信开发者工具打开 `C:\Users\lll\Desktop\lingyu-shop`，重新编译；若工具仍使用旧配置，关闭项目再重新打开。
3. 确认产物目录包含 `app.json`、`app.js`、`app.wxss`。修改 Vue/TS 源码后重新运行上述构建，再点击工具里的编译。

也可以直接导入 `C:\Users\lll\Desktop\lingyu-shop\apps\miniapp\dist\build\mp-weixin`，使用该目录生成的项目配置。实时开发则运行 `pnpm.cmd --filter @lingyu/miniapp dev:mp-weixin`，保持进程运行，导入 `apps/miniapp/dist/dev/mp-weixin`；不要将 build 与 dev 目录混用。微信 watch 命令仍未在本机实测，H5 服务不会生成微信产物。

仓库根微信配置已包含用户设置的 AppID，`src/manifest.json` 的 `mp-weixin.appid` 仍为空，所以直接导入生成目录时当前配置使用 `touristappid`；需要真实账号能力时在 manifest 中配置自己的小程序 AppID 后重新构建。AppID 不等于 AppSecret；此修复不证明账号权限、开发者工具模拟器或微信真机已经验收。

代理受限环境中构建/开发服务需要允许编译子进程，否则可能 spawn EPERM；提升执行权限后本批验证通过，不能据此要求关闭系统安全防护。

本地独立 Compose 容器已通过 T01-C 真实探针。端口仅绑定 loopback，业务库与测试库隔离；当前迁移包括审计、客户会话和管理员 IAM，不含仓店/商品/交易表。GitHub Actions 配置已建立，远程成功证据仍待 T01-B2。

## PostgreSQL / Redis 工程探针

Prisma/client/adapter 7.10.0，pg 8.23.1 同版锁定；自定义生成目录的客户端运行还需要显式 `@prisma/client-runtime-utils` 7.10.0，不能仅凭 generate 成功判断可运行。generated 客户端不提交；schema 和工程迁移入库。Prisma 配置位于根 prisma.config.ts，使用 adapter-pg 接入运行时。

根 `.env` 保存本地 POSTGRES_PASSWORD、POC_DATABASE_URL、REDIS_URL，不提交。按 `.env.example` 填相同密码，URL 对应用户 lingyu_dev、端口 15432、数据库 lingyu_shop_poc。业务 DATABASE_URL 已接入独立 lingyu_shop，不将 PoC 库用于商城。启动与验证：

```text
docker compose --env-file .env -f infra/containers/compose.yaml up -d --wait
pnpm.cmd db:validate
pnpm.cmd db:generate
pnpm.cmd db:migrate:deploy
pnpm.cmd db:poc
pnpm.cmd redis:poc
```

`db:poc` 仅接受无额外连接参数的 loopback 专用库，原子创建 91001/91002，已有记录时拒绝覆盖；成功或失败后只清理本次自有记录，所有并发事务结束后才清理。验证迁移、20 请求竞争 1 份、回滚、非负约束、Prisma 原生查询死锁 P2010 的嵌套 SQLSTATE、Serializable 的 P2034 与整笔有限重试、两连接池。正常重启 PostgreSQL 后再次部署和探针通过；不代表订单、库存账本或业务迁移已实现。

`redis:poc` 使用本项目 Compose Redis，检查 AOF/noeviction、WAITAOF 后的随机键在正常停止/启动后恢复，检查停机连接失败并删除自己的键。会短暂停止 Redis，不在共享/生产环境执行，不使用 FLUSHDB。正常重启验证不能证明断电恢复。

当前 `pnpm test` 包含 2 项进程配置测试、1 项后端配置测试与 5 项探针保护/重试控制测试；纯逻辑用例不代替上述真实数据库命令。镜像 PostgreSQL 17.11、Redis 8.2.10 及官方 index digest 已在 Compose 固定，实测 linux/amd64。Docker 排障、启动/停止与遗留数据处置见 [运行手册](runbooks/docker-windows.md)，实际证据只写入 progress。

## T01-D1：后端启动与隔离数据库

先启动本项目 Compose，再执行 `pnpm.cmd db:init:local`：只允许 loopback:15432、lingyu_dev 的 PoC 管理连接，创建缺失的 lingyu_shop / lingyu_shop_test，不重建/清空已有库。根忽略的 .env 存在且缺业务 URL 时补入 DATABASE_URL；不覆盖已有 URL/NODE_ENV。测试和生产不自动初始化，生产另用最小权限账号和迁移账号。

本地 API/Worker 的 dev/start 读取根 .env；NODE_ENV 必须显式为 development/test/production，DATABASE_URL 必填且不能指向 PoC。test 环境只接受 lingyu_shop_test，非 test 拒绝该库。API 默认端口 3000、每进程 DB_POOL_MAX=5（1..20）、DB_TIMEOUT_MS=3000（100..30000）、SHUTDOWN_TIMEOUT_MS=10000（1000..60000）；端口范围 1..65535。默认 API+Worker 总池预算 10，加运维余量；扩容时按实例数重新计算。

新包 server-modules 构建/类型检查前自动生成其业务客户端；必须安装包内同版 Prisma CLI 和 client，否则 Prisma workspace 解析会失败。业务 schema/迁移在 packages/server-modules/prisma，生成目录在该包 generated，均与原 PoC 分离；当前基础设施只有 append-only `audit_log`，没有商城业务表。`pnpm db:migrate:deploy` 使用根忽略 `.env` 或部署环境中的 `DATABASE_URL` 部署前向迁移；启动不迁移。回退应用不 drop/reset 库。

`pnpm build` 后，`pnpm test` 运行无需 Docker 的配置/工程测试；`pnpm test:database` 先在隔离测试库部署业务迁移，再运行真实 PostgreSQL 测试。后者在确认测试库无人连接后短时 ALLOW_CONNECTIONS=false 并终止仅测试库会话，finally 恢复；中断时先通过 PoC 管理连接执行 `ALTER DATABASE lingyu_shop_test ALLOW_CONNECTIONS true` 再重试。Windows 用仅 test 启用的 IPC 触发关停，Linux 发送 SIGTERM；生产无 IPC 关停入口。当前 Worker 无消费者，事务上下文/审计已由 T01-D3 交付，任务排空归 T12。

Windows 本批后半程遇 Prisma schema-engine-windows.exe 被其他程序占用而 EPERM；只读 Restart Manager 报告 RpcLocator，占用服务未停止。可等待占用释放后重试生成，或仅在当前终端设置 PRISMA_SCHEMA_ENGINE_BINARY 指向 Prisma 下载器取得、核对同版本 commit 的隔离副本后构建；不修改源码默认命令，不关闭防护、不强制结束服务。此副本在忽略的 .local-tools，不能作为远程/干净安装依赖。

Linux 本地实测：官方 Node 24.21.0 bookworm-slim 镜像（digest d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20）中，同一套数据库测试 3/3 通过，子进程真实收到 SIGTERM。Windows junction 不能直接挂入 Linux 使用；本次临时制品保留精确运行依赖图，在 Linux 重建链接后执行，未使用扁平化版本替代。容器只读挂载制品/本地环境文件，使用隔离 Compose 网络；测试开关 LINGYU_TEST_COMPOSE=1 只把已通过 loopback 守卫的 PoC 管理地址映射为固定 postgres:5432。该临时制品不是正式部署方案，远程 CI 需 push 后另行取得运行证据。

## T01-D2：HTTP 契约边界与生成

公共 schema 位于 `packages/contracts/src/openapi.json`，生成类型位于 `packages/contracts/src/generated/openapi.ts`。在安装依赖后运行 `pnpm contracts:verify` 重建类型并拒绝漂移；`pnpm typecheck` 验证 server/API/admin/miniapp 都能消费该契约。源码使用 OpenAPI 3.1/JSON Schema、openapi-typescript 7.13.0 和 AJV 8.20.0；前端没有运行时 AJV 依赖。

本批的工程端点是 `POST /api/v1/_contract/probe`，仅用于验证 requestId、未知字段拒绝、十进制字符串金额和配送枚举。成功与错误 JSON 以及响应头均含 requestId；端点没有业务写入，不能当作商品或交易 API。普通 `pnpm test` 覆盖 schema、脱敏错误边界与事务重试；`pnpm test:database` 已在本机 Compose 通过 API 进程和真实审计事务断言。

## T02-A：客户会话与开发身份

本地 `.env` 还必须配置两个不同的、至少解码为 32 字节的 base64url 值：`AUTH_ACCESS_SIGNING_KEY` 与 `AUTH_REFRESH_TOKEN_PEPPER`；可选的 access/refresh 生命周期分别由 `AUTH_ACCESS_TTL_SECONDS`、`AUTH_REFRESH_TTL_SECONDS` 控制。示例配置不含可用密钥，不能提交真实 `.env`。

`AUTH_DEVELOPMENT_LOGIN_ENABLED=true` 仅允许 development/test；production 配置此值会在启动前拒绝。开发登录只用于隔离开发/测试身份，不代表微信登录，也不接受客户端的微信 openid、手机号或任意 customer ID。客户会话 API 为 `/api/v1/app/auth/development-login`、`/refresh`、`/logout` 和 `/me`；接口/字段以 OpenAPI 为准。刷新令牌和密钥不得写入日志、审计或截图。

`pnpm contracts:verify` 现在在临时位置重新生成 OpenAPI 类型并逐字比较提交的生成文件，因此业务契约变更可以与其生成文件同批提交，同时仍能拒绝手工漂移。

刷新令牌的秘密支持完整 base64url 字符集。已使用摘要单独保存在 used_refresh_token；只有命中旧摘要的重放才撤销会话，随机伪造秘密不会踢掉正常用户。开发会话保存来源标记，关闭开发身份后旧 access/refresh 也不能使用。刷新需由客户端串行调用，重复请求会撤销该会话；结果未知时重新认证。当前薄客户端没有自动刷新重试流程。

小程序 session-storage 提供独立游客意向存取（仓 ID、SKU ID、整数数量），session 清除不影响游客数据；现有预览页面仍未连接真实登录/加购。服务端车与合并由 T05-C 交付。首次全新安装时先 `pnpm build` 生成共享包声明，再运行 `pnpm typecheck` / `pnpm test`。

## T02-B：管理员登录与首次本地账号

先完成上述数据库初始化、追加迁移与构建。后台运行于 `http://127.0.0.1:5173`，API 为 `127.0.0.1:3000`；Vite 将同源 `/api` 转给 API。`ADMIN_ORIGIN` 默认 `http://127.0.0.1:5173`，必须精确匹配地址（不可混用 localhost、附带 `/` 或路径）。修改配置后重启 API；生产必须显式提供 HTTPS Origin，并由同源反向代理把页面与 `/api` 一同提供给浏览器，不依赖开发代理。

没有默认管理员，也不随应用启动创建账号。仅当 development/test、数据库是本地 loopback:15432 且管理员表为空时，可手工初始化首个 IAM_MANAGER。在自己的终端以隐藏输入提供 12～128 字符的唯一初始密码，不把真实凭据写入 `.env`、脚本、命令历史或聊天。Linux 示例：

```bash
read -r -p '管理员用户名（小写字母开头，3～64 位）: ' ADMIN_BOOTSTRAP_USERNAME
read -r -s -p '管理员初始密码: ' ADMIN_BOOTSTRAP_PASSWORD
printf '\n'
export ADMIN_BOOTSTRAP_USERNAME ADMIN_BOOTSTRAP_PASSWORD
pnpm admin:bootstrap
unset ADMIN_BOOTSTRAP_USERNAME ADMIN_BOOTSTRAP_PASSWORD
```

脚本读取根忽略的 `.env` 中的数据库/运行配置，但用户名与密码仅由当前进程环境提供；只输出成功或统一失败，不回显秘密。production 和已有管理员时拒绝，不能通过删表或重复 seed 来恢复账号。首次账户只负责账号/权限与审计，不自动拥有仓业务权限；需要另添加对应仓角色。真实仓店创建属于 T03-A，当前范围只接受规范小写 UUID，不能把任意范围编号当成已存在门店。

Cookie 是独立 HttpOnly、SameSite=Strict 会话，生产额外 Secure 和 __Host- 前缀；页面不使用 localStorage 认证。所有写操作需要精确 Origin，除登录外另需会话派生 CSRF；页面刷新通过 me 恢复。授权修改/停用会立即撤销目标旧会话，必须重新登录；自己不能修改自身授权，旧版本更新返回 409。连续五次失败锁定登录 15 分钟；会话绝对有效 8 小时，无自动续期或在线密码重置。不要把管理员 Cookie/CSRF 或密码写入截图、日志。

本地验收使用 `pnpm test`（先 build）与独立 `pnpm test:database`。后者要求管理员测试表为空；检测已有管理员就拒绝 bootstrap，不能清空已有账号换取测试通过。不得与后台浏览器测试/其他测试进程并行使用同一测试库。测试只清理自己的随机账号、会话与审计，不操作业务库；它不证明生产代理、MFA/账号恢复、微信真机已验收。

管理员列表最多 100 条、审计最近 50 条；当前无分页、密码找回、生产管理员开通、MFA、分布式/IP 限流或定时会话清理。生产上线需额外完成上述安全/运维与恢复验收。当前能力以 [管理员规格](../openspec/specs/admin-iam/spec.md) 为准。
