# 开发进度

## 2026-10-09：T05-A 一期三入口界面外壳

起点 `5c1b449`，工作区干净。已读取根 AGENTS、tasks/progress/development、路线/原型映射、ADR-002、总体设计前端与验收章节和当前小程序代码；无局部 AGENTS。用户要求按任务推进，批末检查当前完整 diff 并给出 commit 标题/正文供审阅，由用户 push，已写入 AGENTS。没有创建提交或推送。

环境复查：Docker 引擎仍报 dockerDesktopLinuxEngine 管道不存在，T01-C1 保留阻塞；不修改系统或清库。本批选择独立的 T05-A，先编写 `openspec/changes/t05-a-shell/design.md` 再实现界面，当前外壳能力落入 `openspec/specs/miniapp-shell/spec.md`。

交付：发现/市集/我的三个原生 tabBar 主包页面，ui-tokens 共享 CSS 变量，5 个视觉组件，独立示例数据与状态逻辑。发现支持话题筛选（关注显示空态）；市集支持分类与自提/配送模式预览；我的仅游客占位，不伪造会员/券/成长值/余额/订单。搜索、发布、选规格、登录、结算和生活服务禁用并标记尚未开放。开发模式提供状态预览及错误重试；生产构建隐藏状态控制，始终展示示例提示。本批不接 API、不新增业务表、不写真实资产或购物车。

验证：冻结安装、pnpm.cmd check、全工程 typecheck/build、miniapp build:h5、现有工程集成测试 2/2 通过。首次离线安装因 pg 元数据缺失失败，改 prefer-offline 后成功，锁文件仅增加 ui-tokens 本地链接，无版本升级；随后 frozen-lockfile --offline 通过。首次 typecheck 缺 Vite ImportMeta 类型，补声明后通过。微信产物核对三个页面/tabBar 和生产状态开关 false；不作为微信真机证据。

H5 实测：375×812 及 320×640，三入口可切换，话题/分类结果与选中状态一致、自提配送提示切换、加载/空态/错误及重试恢复；发现列表滚动 485px，切市集再返回仍为 485px；窄屏无横向溢出，列表独立滚动、底部 tabBar 与购物车占位可见。浏览器调整视口后需刷新使 uni-app 重新适配；验收在刷新后进行。截图 `docs/acceptance/evidence/t05-a/market-h5-375.png` 已视觉复核。控制台无应用错误；DCloud 间接 vue-router 导入存在弃用警告，依赖安全审查仍属 T01-B2。

启动命令/端口不变；`pnpm.cmd --filter @lingyu/miniapp dev:h5` 在 127.0.0.1:5174，进入三入口预览，无新增环境变量。任务/开发方式/原型映射已同步。批末检查 tracked diff、全部新源码/规格/截图及 git diff --check；不提交依赖目录或构建产物。

限制与下一步：T05-A 仅界面外壳完成，不等于 P1-A 或第一原型业务验收；微信 AppID/开发者工具/真机、安全区、真实登录、弱网均待后续。优先恢复 T01-C1→C2/C3，然后 T01-D→T02→T03/T05-B/C 贯通 FLOW-01；数据库阻塞期间可继续身份/契约规格设计，不能以 fixture 替代真实数据库验收。

## 2026-10-08：两原型审查与实施规划（T00-A）

用户授权分析整个项目、直接修订架构与任务文档，并要求先设计后开发，先5000后50000。本批仅交付设计与文档，没有新增业务代码、迁移或依赖版本。开始读取AGENTS、任务/进度/开发方式、总体设计各章节、ADR-001、工程入口/schema/PoC/测试/CI；未发现适用局部AGENTS。起点bc3dad2，Git工作区干净。

原型证据：重新读取两个公开HTML/CSS/JS，UTF-8快照和SHA256保存在docs/reference；第一原型浏览器初始状态成功读取，未进行逐入口浏览器点击/真机操作。5000三入口、标签样式切换、自提配送切换、抽屉加减/清空有脚本；发布/搜索/券/订单/结算等缺实际动作。50000定义12个页面和首页内feed导航，直播明确未设计，大量入口仅toast，提交为定时模拟付款。范围映射区分源交互、展示和正式功能补齐。

审查结论：现有框架与总体交易架构保留；API只有/health，Worker无任务，两端工程占位，共享业务包空导出，Prisma只有EngineeringProbe。T01不标整体完成。已完成T00-A设计，T00-B业务确认仍进行中。

交付：development-roadmap（架构/模块归属/分阶段门槛/流程/规则责任与确认时点）、prototype-mapping（P1/P2子项与任务/验收）、ADR-002（后端复用与任务基础）、phase1-baseline待实现规格；tasks扩展成具体子任务并保留历史表；总体设计v1.1增加执行修订，AGENTS/README更新入口，development校正历史与当前描述及测试命令。

主要调整：T01拆本地兼容、远程CI/安全、真实数据验证；T12-A先于订单；地址/服务解除对整个社区依赖；T01-D计划新增server-modules但本批不新增workspace包；默认P1-A→P1-B→P2，用户若只需演示版须记录替代门槛；多仓/称重/AI为可选后续。真实规则未定项只阻塞相关任务。根pnpm test实际不自动build，已修正说明。

验证：pnpm.cmd check、typecheck、db:validate、db:generate、全部应用/源码包build、miniapp build:h5、pnpm.cmd test全部通过（2/2工程进程测试）。首次diff --check发现修改的版本行保留了Markdown尾空格，已修正；最终diff --check、tracked差异/新文件审阅、本地Markdown链接与UTF-8字符检查、两快照SHA256核对均通过。未用工程测试证明任何业务功能。未更改启动入口、系统执行策略或运行时版本。

环境：Node24.21.0/pnpm12.9.1核实；PowerShell可读取文件，pnpm.ps1被执行策略拒绝时改用pnpm.cmd。沙箱内Git/Node原生进程异常退出，按权限流程在沙箱外成功运行。docker info本次仍报dockerDesktopLinuxEngine管道不存在，真实PostgreSQL/Redis、事务迁移/锁/Prisma重试未运行；远程CI、安全/支持周期、微信登录/真机、真实支付均未验收。没有修改系统、清库、提交或推送。

下一批：T01-C1/C2/C3恢复真实数据验证与T00-B相关输入；随后T01-D公共基础→T02→T03/T05贯通FLOW-01。数据库阻塞期间可先T05-A视觉外壳/独立规格，但fixture不能替代真实数据库或微信验收。

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
