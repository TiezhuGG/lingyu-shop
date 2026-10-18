CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "CustomerIdentityProvider" AS ENUM ('DEVELOPMENT');
CREATE TYPE "SessionSubjectType" AS ENUM ('CUSTOMER', 'ADMIN');

CREATE TABLE "customer" (
    "id" UUID NOT NULL,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_identity" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "provider" "CustomerIdentityProvider" NOT NULL,
    "provider_key" VARCHAR(256) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_identity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "subject_type" "SessionSubjectType" NOT NULL,
    "refresh_hash" VARCHAR(128) NOT NULL,
    "refresh_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" VARCHAR(64),
    "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_identity_provider_key_key" ON "customer_identity"("provider_key");
CREATE INDEX "customer_status_idx" ON "customer"("status");
CREATE INDEX "customer_identity_customer_id_idx" ON "customer_identity"("customer_id");
CREATE INDEX "session_subject_id_subject_type_idx" ON "session"("subject_id", "subject_type");
CREATE INDEX "session_refresh_expires_at_idx" ON "session"("refresh_expires_at");

ALTER TABLE "customer_identity"
  ADD CONSTRAINT "customer_identity_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
