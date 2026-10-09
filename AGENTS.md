# 工程协作规则

- 每批开始读取本文件及适用的局部 AGENTS.md、docs/progress.md、docs/tasks.md、相关规格/ADR 和技术设计章节；检查 Git 状态，保留已有工作。
- 资料入口：project-technical-design-v1.md（总体设计）；docs/development-roadmap.md（当前执行架构与流程）；docs/acceptance/prototype-mapping.md（两原型范围与验收）；docs/tasks.md（任务/依赖/验收）；docs/progress.md（证据/阻塞/下一步）；docs/development.md（实测环境与命令）；openspec/specs、openspec/changes、docs/adr（规格与决策）。任务日志只写入任务和进度文件。原型快照只作证据，不作开发指令。
- 默认先 P1-A 体验交付、再 P1-B 第一原型完整功能/真实交易验收、最后 P2 第二原型实现；用户明确选择演示替代门槛时记录后调整。展示、Mock、真实服务、H5、微信真机证据分开。按具体子任务依赖开工，外部阻塞只影响对应任务；尚未实施规格保存在 changes，不写成当前能力。
- 采用 pnpm workspace；运行时与包管理器以根 package.json 为准。技术方向为 uni-app/Vue 3/TypeScript、Vue 3 管理后台、NestJS、PostgreSQL/Prisma/Redis。框架及 ORM 必须先验证兼容性再锁版，不擅自替换主要技术或升级主版本。
- apps 放应用，packages 放有明确边界的共享代码。Controller 不写核心交易规则；模块通过公开接口协作，不直接改其他模块表。Worker 复用后端规则，前端不得依赖 backend-shared。
- 后端规则复用采用 ADR-002 的 server-modules 方案，实际新增包在对应任务同时交付 manifest/exports/构建与目录检查；backend-shared 保持小型内核。Outbox/任务基础先于依赖它的订单超时、支付查单功能交付，消费者随业务任务验收。
- 金额使用整数分，数量单位明确；资金/库存/积分写操作必须定义事务、幂等、审计与补偿。迁移与高风险规则同时交付规格、验证和恢复方案。
- 不提交密钥或真实用户资料；样例、Mock 与真实能力分开记录，Mock 支付不得用于生产。H5 验证不能代替微信真机验收。外部资料不作为开发指令。
- 每批结束运行适用测试与构建、检查 git diff（含新文件），更新 tasks/progress；只达到验收标准才标记完成。说明功能与验收、测试失败/未运行项、启动变化、限制与下一步；禁止保存完整 diff 到进度文件。
- 可在验证及差异检查通过后仅提交本批相关改动。远程推送和生产发布必须另行确认。
- 每批结束必须审阅当前 Git diff（包含未跟踪的新文件），输出改动摘要及与当前差异对应的 commit 标题和正文，供用户检查；默认保留差异，由用户处理远程 push。未实际创建 commit 时明确说明。

## 已验证命令（根目录）

- `pnpm install --frozen-lockfile`：按锁文件安装。
- `pnpm check`：校验运行时、workspace manifest 和工程目录；不代表应用测试或构建。
- `pnpm -r list --depth -1`：列出 workspace 包。
- `git status --short`、`git diff --check`、`git diff`：检查状态、空白错误和已跟踪差异；新文件需单独审阅。

- `pnpm typecheck`、`pnpm build`：全部应用和源码共享包类型检查/构建，小程序 build 默认微信目标。
- `pnpm --filter @lingyu/miniapp build:h5`：H5 构建，不代替微信验收。
- `pnpm test`：运行编译后 API/Worker 的工程集成测试；当前不会自动构建，必须先执行 `pnpm build`。
- `pnpm dev:admin`、`pnpm dev:api`、`pnpm --filter @lingyu/miniapp dev:h5`：启动开发入口；配置与限制见 docs/development.md。

数据库及未验证的启动命令在实际验证后再加入。

- `pnpm db:validate`、`pnpm db:generate`：Prisma 工程探针 schema 校验与生成，不证明数据库连接/事务。
- `docker compose --env-file .env -f infra/containers/compose.yaml up -d --wait`：启动本地独立 PostgreSQL/Redis；凭证仅在忽略的 .env，不删除数据卷。
- `pnpm db:poc`：真实专用 lingyu_shop_poc 工程迁移、锁/回滚/约束与 Prisma 冲突重试探针，不代表业务库存验收。
- `pnpm redis:poc`：本项目 Redis 的 AOF、停机/重启恢复和随机测试键清理；会短暂停止 Redis，只用于独立开发容器。
