# 开发进度

## 2026-10-08：T01 当前成果提交与同步

用户明确授权为当前成果创建提交并推送 origin/main。开始已检查根规则、任务/进度/开发记录、ADR、Git 状态及远程；本批仅整理和交付此前 T01 改动，没有新增商城业务。

重新验证：pnpm check、typecheck、全部应用/源码包 build、小程序 build:h5、2/2 API/Worker 运行测试、Prisma validate/generate 均通过；差异和提交文件检查不包含 .env、生成客户端、构建制品或依赖目录。没有新的启动方式变化。

T01 仍进行中：真实 PostgreSQL/Redis 连接、迁移、事务/锁/死锁重试，微信真机，以及远程 CI 成功证据未完成。本批不因提交推送而改变验收结论。下一步仍为修复本机 Docker/WSL 环境并运行真实数据库探针；远程 CI 执行结果需另行核实。

## 2026-10-07：T01 框架工程续批

开始检查：读取根规则、任务、进度、开发说明及技术设计第 6/19/20 章；未发现局部规则，ADR/规格目录原为空。用户已自行提交并推送初始化；当前起点 bed1344，工作区干净，origin 为用户项目仓库。旧批次中“未提交”仅为当时状态。

完成输出：API NestJS 工程健康接口、Worker Nest 上下文（无任务）、后台 Vue Router/Pinia 工程占位页、小程序 Vue/Pinia 工程占位页；共享 TypeScript 基线、类型检查/构建脚本、2 项真实进程集成测试及 CI 配置。真实商城能力和模拟商城能力均无新增。

验证证据：

- 官方 npm registry 锁版；首次 peer 检查发现小程序 Vue 与内置 server-renderer 不一致，已调整 Vue 3.4.21/Pinia 2.1.7。再次 `pnpm peers check` 无问题。
- 首次小程序构建拒绝空 App 脚本，改为有效组件后通过。
- 安装因 pnpm 默认禁用 esbuild/vue-demi 脚本失败；明确允许这两项必要脚本、拒绝 core-js 的非必要脚本后，标准 `pnpm install --frozen-lockfile` 通过。
- `pnpm check`、`pnpm typecheck`、`pnpm build`、小程序 `build:h5` 全部通过。微信编译器 5.31；微信/H5 制品均生成，无真实 AppID，未上传或真机运行。
- `pnpm test`：2/2 通过，验证编译后 API /health 为 200、未知路由为 404、Worker 上下文可初始化并关闭。
- 后台、H5、API 开发入口成功启动；受限执行环境首次因子进程 EPERM 失败，提升执行权限后通过。前端端口分离为 5173/5174，避免并行启动冲突。
- Git tracked diff 和全部新入口/config/test/workflow 文件已审阅；空白错误检查通过。CI 未远程执行；无远程推送或生产发布。

启动变化：从无可启动应用变为工程入口可运行，命令和服务地址见 development.md。API/Worker dev 首次编译后监视 dist；修改源码需另行 build，当前不宣称源码热重载。

未运行/阻塞：Docker CLI 29.8.2、Compose 5.5.1 可用，但 Linux 引擎管道不存在，`docker desktop start` 提升权限后仍因 Docker 安装注册键缺失失败；本机也无 psql/redis-server。未安装/接入 Prisma、未运行真实迁移/事务/参数化锁/连接池/死锁重试/Redis；禁止用内存数据库替代。CI 远程执行、支持周期、安全审计、微信真机及前端浏览器完整交互验证未完成。

后续补充（同批）：用户选择修复本机 Docker Desktop。已从实际安装入口尝试启动并检查 WSL；Windows 10.0.22000.708，Docker 当前官方要求 Windows 11 build 22631+、WSL 2.1.5+。旧 WSL 不识别 --version/--list --verbose，--status 失败；DISM 检查返回 740（需要 Windows 管理员权限），工具沙盒提权不等于系统管理员。没有删除容器/镜像/数据、修改注册表或重启系统。

独立工程验证补充：稳定 Prisma/client/adapter 7.10.0 与 pg 8.23.1 已精确安装；`pnpm db:validate` 和 `pnpm db:generate` 通过。建立 engineering_probe 模型、迁移 SQL 及数据库 PoC 脚本（与业务库存/订单分开）；脚本仅接受 loopback 的 lingyu_shop_poc 专用库，预设迁移、参数化锁、并发预占、回滚、真实死锁重试和池上限检查。`node --check` 通过；`pnpm db:poc` 因没有 POC_DATABASE_URL 明确失败，未连接数据库，因此不能声称这些检查已通过。

下一步：先完成本机 Windows/WSL 环境修复并使 `docker info` 显示服务端，再创建项目容器验证 PostgreSQL/Redis 版本和事务 PoC。详见 docs/runbooks/docker-windows.md。T01-B/C 均仍进行中，T01 整包未验收。

已建立独立项目 Compose（loopback 15432/16379、专用数据库/数据卷）；`docker compose ... config --no-interpolate --quiet` 通过，未启动容器，镜像补丁/digest 待真实验证后固定。最终回归：冻结安装、peer、类型、全部构建、H5 构建、2/2 进程测试、Prisma 校验/生成和 diff 空白检查均通过。因真实数据库 PoC 尚未通过，本批保留工作区改动，未创建本地提交、未推送。

## 2026-10-07：工程初始化

范围：按用户最新指令，仅建立 AGENTS.md 和清晰的 pnpm workspace 骨架，暂不写业务代码。

### 开始检查

- 原目录只有 project-technical-design-v1.md（101,917 字节），没有既有代码或 Git 仓库；未发现祖先目录 AGENTS.md。
- 已读取技术方向、目录与协作建议以及一期工作包（设计第 6、21、22 章）。原技术设计保持不变。
- Node 24.21.0、pnpm 12.9.1、Git 2.56.0.windows.1 可用；PowerShell 因 CET 问题启动失败，改用 cmd.exe。

### 本批输出

- 4 个应用与 4 个共享包的私有 workspace manifest，根运行时约束及 pnpm 配置。
- 数据库、规格、测试、部署与文档目录；说明各应用尚未接入框架。
- 简洁 AGENTS.md、任务依赖/验收表、开发方式和进度记录。
- 工程目录检查脚本；不提供空业务测试或构建脚本。

### 验证证据

- `pnpm --version`：12.9.1；`pnpm check`：运行时、8 个私有包及必需目录检查全部通过。
- `pnpm -r list --depth -1`：识别根项目与全部 8 个子包。
- 离线安装生成 pnpm-lock.yaml；离线冻结安装及标准 `pnpm install --frozen-lockfile` 均通过（安装需提升执行权限以写入本机操作锁）。
- 初次安装失败：自动解析包管理器时 registry.npmmirror.com 连接拒绝；禁用自动下载后受限环境写操作锁拒绝访问。使用本地存储并提升执行权限后完成安装。未验证后续第三方依赖联网下载。
- 已审阅本批新文件、workspace manifest、锁文件和 Git 差异；`git diff --check` 与暂存差异空白检查通过。原技术设计未修改且不纳入本批提交。
- T01-A 达到骨架验收；T01 整包仍进行中，T00、T01-B/C 和业务任务未完成。
- 已初始化 Git 并暂存本批 67 个文件。尝试本地提交未成功：Git 未配置作者姓名/邮箱；未擅自设置身份。原技术设计保持未跟踪。本批未产生提交，也未推送远程。

### 能力、阻塞与下一步

- 真实业务能力：无。模拟业务能力：无。当前仅工程骨架。
- 应用测试/构建、数据库事务/迁移、微信真机均未运行，因对应实现及环境尚未接入。
- 启动方式：没有可启动应用，本批不增加业务启动命令。
- PowerShell CET 问题有 cmd.exe 替代，不阻塞本批。正式框架/数据库/微信环境验证仍待后续批次。
- 下一批先检查规则、进度、相关设计及 Git 状态，再推进 T00 和 T01-B/C；后续实施 FLOW-01，不将子集贯通计作完整一期完成。
