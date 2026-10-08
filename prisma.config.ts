import { defineConfig } from 'prisma/config';

// Validation/generation do not connect. PoC requires a separate, explicit URL.
export default defineConfig({
  schema: 'database/schema/schema.prisma',
  migrations: { path: 'database/migrations' },
  datasource: { url: process.env.POC_DATABASE_URL ?? 'postgresql://unused:unused@127.0.0.1:5432/lingyu_shop_poc' },
});
