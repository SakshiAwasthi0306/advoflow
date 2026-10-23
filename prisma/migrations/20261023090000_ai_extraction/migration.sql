-- AlterEnum
ALTER TYPE "app"."Extractor" ADD VALUE 'GEMINI';
ALTER TYPE "app"."Extractor" ADD VALUE 'OPENROUTER';

-- AlterTable
ALTER TABLE "app"."CourtOrder" ADD COLUMN     "fieldReview" JSONB;

