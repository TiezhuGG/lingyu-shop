-- Existing sessions originate exclusively from the T02-A development adapter.
ALTER TABLE "session" ADD COLUMN "development_only" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "used_refresh_token" (
    "session_id" UUID NOT NULL,
    "digest" VARCHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "used_refresh_token_pkey" PRIMARY KEY ("session_id", "digest"),
    CONSTRAINT "used_refresh_token_session_id_fkey" FOREIGN KEY ("session_id")
      REFERENCES "session"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
