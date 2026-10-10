CREATE TYPE "AuditSource" AS ENUM ('API', 'WORKER');
CREATE TYPE "AuditActorType" AS ENUM ('SYSTEM', 'CUSTOMER', 'ADMIN');

CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "source" "AuditSource" NOT NULL,
    "actorType" "AuditActorType",
    "actorId" VARCHAR(128),
    "action" VARCHAR(100) NOT NULL,
    "objectType" VARCHAR(100) NOT NULL,
    "objectId" VARCHAR(128) NOT NULL,
    "requestId" VARCHAR(64),
    "idempotencyKey" VARCHAR(128),
    "changes" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_log_objectType_objectId_idx" ON "audit_log"("objectType", "objectId");
CREATE INDEX "audit_log_requestId_idx" ON "audit_log"("requestId");
CREATE INDEX "audit_log_idempotencyKey_idx" ON "audit_log"("idempotencyKey");
