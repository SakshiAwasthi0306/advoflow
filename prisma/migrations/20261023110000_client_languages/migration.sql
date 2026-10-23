-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "app"."Language" ADD VALUE 'HI';
ALTER TYPE "app"."Language" ADD VALUE 'TA';
ALTER TYPE "app"."Language" ADD VALUE 'TE';
ALTER TYPE "app"."Language" ADD VALUE 'ML';
ALTER TYPE "app"."Language" ADD VALUE 'MR';
ALTER TYPE "app"."Language" ADD VALUE 'GU';
ALTER TYPE "app"."Language" ADD VALUE 'BN';
ALTER TYPE "app"."Language" ADD VALUE 'PA';
ALTER TYPE "app"."Language" ADD VALUE 'OR';
ALTER TYPE "app"."Language" ADD VALUE 'AS';
ALTER TYPE "app"."Language" ADD VALUE 'UR';
ALTER TYPE "app"."Language" ADD VALUE 'KOK';

-- AlterTable
ALTER TABLE "app"."ClientMessage" ADD COLUMN     "checkText" TEXT,
ADD COLUMN     "origin" TEXT;

