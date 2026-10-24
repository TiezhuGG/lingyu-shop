CREATE TABLE "asset_upload" (
  "id" UUID PRIMARY KEY,
  "store_id" UUID NOT NULL REFERENCES "store"("id") ON DELETE RESTRICT,
  "owner_id" UUID NOT NULL REFERENCES "admin_account"("id") ON DELETE RESTRICT,
  "purpose" VARCHAR(16) NOT NULL DEFAULT 'CMS_IMAGE' CHECK ("purpose" = 'CMS_IMAGE'),
  "mime" VARCHAR(16) NOT NULL CHECK ("mime" IN ('image/png', 'image/jpeg')),
  "size" INTEGER NOT NULL CHECK ("size" BETWEEN 1 AND 2097152),
  "sha256" VARCHAR(64) NOT NULL CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  "status" VARCHAR(24) NOT NULL DEFAULT 'ISSUED' CHECK ("status" IN ('ISSUED', 'STORED', 'DEVELOPMENT_READY', 'REVOKED')),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "raw_key" VARCHAR(68), "ready_key" VARCHAR(68),
  "width" INTEGER, "height" INTEGER,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("expires_at" > "created_at"),
  CHECK ("raw_key" IS NULL OR "raw_key" = "sha256" || CASE "mime" WHEN 'image/png' THEN '.png' ELSE '.jpg' END),
  CHECK ("ready_key" IS NULL OR "ready_key" ~ '^[0-9a-f]{64}\.png$'),
  CHECK (("width" IS NULL AND "height" IS NULL) OR ("width" BETWEEN 1 AND 4096 AND "height" BETWEEN 1 AND 4096 AND "width"::bigint * "height" <= 16000000)),
  CHECK (("status" = 'ISSUED' AND "raw_key" IS NULL AND "ready_key" IS NULL AND "width" IS NULL AND "height" IS NULL) OR
         ("status" = 'STORED' AND "raw_key" IS NOT NULL AND "ready_key" IS NULL AND "width" IS NULL AND "height" IS NULL) OR
         ("status" = 'DEVELOPMENT_READY' AND "raw_key" IS NOT NULL AND "ready_key" IS NOT NULL AND "width" IS NOT NULL AND "height" IS NOT NULL) OR "status" = 'REVOKED')
);
CREATE INDEX "asset_upload_store_id_owner_id_id_idx" ON "asset_upload"("store_id", "owner_id", "id");
