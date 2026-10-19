# contracts

前后端 DTO、枚举和生成客户端；不得导出服务端领域实现。

T03-A0 契约包含公开/管理员商城设置、三种履约草稿、整数分可空字段和版本化保存；公开类型不暴露未生效草稿。enabledMethods 为空且 checkoutEnabled=false，不把草稿类型当成已开通服务。

`src/openapi.json` 是当前唯一的公共 HTTP schema 来源。`pnpm generate` 通过锁定的 openapi-typescript 生成 `src/generated/openapi.ts`，`pnpm verify:generated` 重建后检查文件没有漂移。薄客户端只要求调用方提供请求函数，避免把浏览器、uni-app 或服务端运行时耦合进契约包。

当前包含无业务副作用的 T01-D2 工程探针、T02-A 客户会话 DTO/薄客户端、T02-B 管理员 Cookie/CSRF、角色/范围及审计 DTO。后台薄客户端在 apps/admin 内只依赖这些生成类型；本包不提供服务端鉴权实现、微信身份、价格、库存或交易规则。`verify:generated` 在临时目录重建并比较生成结果，不以工作树相对 Git 提交的正常契约改动判定失败。
