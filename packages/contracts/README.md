# contracts

前后端 DTO、枚举和生成客户端；不得导出服务端领域实现。

`src/openapi.json` 是当前唯一的公共 HTTP schema 来源。`pnpm generate` 通过锁定的 openapi-typescript 生成 `src/generated/openapi.ts`，`pnpm verify:generated` 重建后检查文件没有漂移。薄客户端只要求调用方提供请求函数，避免把浏览器、uni-app 或服务端运行时耦合进契约包。

当前包含无业务副作用的 T01-D2 工程探针，以及 T02-A 的客户会话 DTO 与薄客户端；不提供微信身份、管理员 RBAC、价格、库存或交易能力。`verify:generated` 在临时目录重建并比较生成结果，不以工作树相对 Git 提交的正常契约改动判定失败。
