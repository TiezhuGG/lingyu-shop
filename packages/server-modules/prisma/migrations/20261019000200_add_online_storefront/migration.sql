CREATE TYPE "FulfillmentMethod" AS ENUM ('EXPRESS', 'LOCAL_DELIVERY', 'PICKUP');
CREATE TABLE "store" (
  "id" UUID PRIMARY KEY CHECK ("id" = '00000000-0000-4000-8000-000000000001'::uuid),
  "display_name" VARCHAR(64) NOT NULL CHECK (char_length(btrim("display_name", E' \t\r\n')) > 0),
  "mode" VARCHAR(16) NOT NULL DEFAULT 'ONLINE' CHECK ("mode" = 'ONLINE'),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL
);
CREATE TABLE "store_fulfillment_draft" (
  "store_id" UUID NOT NULL REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "method" "FulfillmentMethod" NOT NULL,
  "fee_minor" BIGINT CHECK ("fee_minor" BETWEEN 0 AND 999999999999),
  "free_above_minor" BIGINT CHECK ("free_above_minor" BETWEEN 0 AND 999999999999),
  "service_description" VARCHAR(500),
  "pickup_address" VARCHAR(200),
  PRIMARY KEY ("store_id", "method"),
  CHECK ("method" = 'PICKUP' OR "pickup_address" IS NULL)
);
-- No default store, physical location, operating rules or accounts are inserted.
