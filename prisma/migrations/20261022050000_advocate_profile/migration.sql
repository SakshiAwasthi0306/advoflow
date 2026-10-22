-- CreateEnum
CREATE TYPE "app"."DeletionStatus" AS ENUM ('PENDING', 'CANCELLED', 'COMPLETED');

-- AlterTable
ALTER TABLE "app"."User" ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "phoneNumberVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "app"."AdvocateProfile" (
    "userId" TEXT NOT NULL,
    "barEnrolmentNo" TEXT,
    "stateBarCouncil" TEXT,
    "practiceSinceYear" INTEGER,
    "practiceAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "officeAddressLine1" TEXT,
    "officeAddressLine2" TEXT,
    "officeCity" TEXT,
    "officeState" TEXT,
    "officePincode" TEXT,
    "preferredCourtIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredCourtLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "photoKey" TEXT,
    "photoMime" TEXT,
    "photoUpdatedAt" TIMESTAMPTZ(6),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AdvocateProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "app"."AccountDeletionRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "app"."DeletionStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "requestedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledFor" TIMESTAMPTZ(6) NOT NULL,
    "handledAt" TIMESTAMPTZ(6),

    CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profile_bar_enrolment_uniq" ON "app"."AdvocateProfile"("stateBarCouncil", "barEnrolmentNo") WHERE ("barEnrolmentNo" IS NOT NULL AND "stateBarCouncil" IS NOT NULL);

-- CreateIndex
CREATE INDEX "AccountDeletionRequest_status_scheduledFor_idx" ON "app"."AccountDeletionRequest"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "AccountDeletionRequest_userId_idx" ON "app"."AccountDeletionRequest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "app"."User"("phoneNumber");

-- AddForeignKey
ALTER TABLE "app"."AdvocateProfile" ADD CONSTRAINT "AdvocateProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

