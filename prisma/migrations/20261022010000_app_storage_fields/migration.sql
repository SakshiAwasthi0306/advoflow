-- DropForeignKey
ALTER TABLE "app"."Hearing" DROP CONSTRAINT "Hearing_officeId_confirmedById_fkey";

-- DropForeignKey
ALTER TABLE "app"."Task" DROP CONSTRAINT "Task_officeId_sourceVersionId_fkey";

-- DropForeignKey
ALTER TABLE "app"."Task" DROP CONSTRAINT "Task_officeId_assigneeId_fkey";

-- AlterTable
ALTER TABLE "app"."Office" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "app"."Task" DROP COLUMN "sourceVersionId",
ADD COLUMN     "sourceReportId" TEXT;

-- AlterTable
ALTER TABLE "app"."ResearchVersion" ADD COLUMN     "bookmarkedProvisionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "app"."ResearchAuthority" ADD COLUMN     "materialFacts" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "treatment" TEXT;

-- AddForeignKey
ALTER TABLE "app"."Task" ADD CONSTRAINT "Task_officeId_sourceReportId_fkey" FOREIGN KEY ("officeId", "sourceReportId") REFERENCES "app"."ResearchReport"("officeId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

