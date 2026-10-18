CREATE TYPE "AdminStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "AdminRoleName" AS ENUM ('IAM_MANAGER', 'STORE_OPERATOR', 'STORE_READER');
CREATE TABLE "admin_account" (
  "id" UUID PRIMARY KEY,
  "username" VARCHAR(64) NOT NULL UNIQUE,
  "password_hash" VARCHAR(256) NOT NULL,
  "status" "AdminStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "failed_login_count" INTEGER NOT NULL DEFAULT 0 CHECK ("failed_login_count" >= 0),
  "locked_until" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "admin_grant" (
  "id" UUID PRIMARY KEY,
  "admin_id" UUID NOT NULL REFERENCES "admin_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "role" "AdminRoleName" NOT NULL,
  "scope_key" VARCHAR(36) NOT NULL,
  CONSTRAINT "admin_grant_scope_check" CHECK (
    ("role" = 'IAM_MANAGER' AND "scope_key" = 'GLOBAL') OR
    ("role" IN ('STORE_OPERATOR', 'STORE_READER') AND "scope_key" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  )
);
CREATE UNIQUE INDEX "admin_grant_admin_id_role_scope_key_key" ON "admin_grant"("admin_id", "role", "scope_key");
CREATE TABLE "admin_session" (
  "id" UUID PRIMARY KEY,
  "admin_id" UUID NOT NULL REFERENCES "admin_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "digest" VARCHAR(64) NOT NULL,
  "version" INTEGER NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "admin_session_admin_id_expires_at_idx" ON "admin_session"("admin_id", "expires_at");
