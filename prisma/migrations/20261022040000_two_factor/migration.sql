-- AlterTable
ALTER TABLE "app"."User" ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "app"."TwoFactor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "verified" BOOLEAN,
    "failedVerificationCount" INTEGER,
    "lockedUntil" TIMESTAMPTZ(6),

    CONSTRAINT "TwoFactor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TwoFactor_userId_idx" ON "app"."TwoFactor"("userId");

-- AddForeignKey
ALTER TABLE "app"."TwoFactor" ADD CONSTRAINT "TwoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Two-step login is mandatory: switch it on for accounts created before this migration too.
UPDATE "app"."User" SET "twoFactorEnabled" = true WHERE "twoFactorEnabled" IS DISTINCT FROM true;
