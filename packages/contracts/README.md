# contracts

前后端 DTO、枚举和生成客户端；不得导出服务端领域实现。

`src/openapi.json` 是当前唯一的公共 HTTP schema 来源。`pnpm generate` 通过锁定的 openapi-typescript 生成 `src/generated/openapi.ts`，`pnpm verify:generated` 重建后检查文件没有漂移。薄客户端只要求调用方提供请求函数，避免把浏览器、uni-app 或服务端运行时耦合进契约包。

当前只包含无业务副作用的 T01-D2 工程探针；不提供商城 DTO、身份、价格、库存或交易能力。
