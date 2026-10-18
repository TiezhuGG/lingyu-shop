# admin

Vue 3 + TypeScript + Vite 管理后台工程入口，含 Router/Pinia。

开发 `pnpm dev:admin`，构建 `pnpm --filter @lingyu/admin build`（根目录）。T02-B 提供独立管理员登录/恢复/登出、角色与仓范围、账号创建/停用/授权编辑和脱敏审计；无商品、仓店或交易页面。同源 /api 在开发时代理至 127.0.0.1:3000，生产需同源 HTTPS 代理。首次账号通过手工本地初始化，不能使用默认账号。完整步骤见 docs/development.md，能力边界见 openspec/specs/admin-iam/spec.md。
