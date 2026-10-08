-- Engineering-only PoC. Business migrations will be specified separately.
CREATE TABLE "engineering_probe" (
  "id" INTEGER NOT NULL,
  "available" INTEGER NOT NULL CHECK ("available" >= 0),
  CONSTRAINT "engineering_probe_pkey" PRIMARY KEY ("id")
);
