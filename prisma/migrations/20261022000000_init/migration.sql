-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateEnum
CREATE TYPE "app"."Role" AS ENUM ('OWNER', 'ADVOCATE', 'CLERK', 'VIEWER');

-- CreateEnum
CREATE TYPE "app"."Language" AS ENUM ('EN', 'KN');

-- CreateEnum
CREATE TYPE "app"."ContactChannel" AS ENUM ('WHATSAPP', 'PHONE', 'EMAIL');

-- CreateEnum
CREATE TYPE "app"."CourtLevel" AS ENUM ('SUPREME', 'HIGH', 'DISTRICT', 'TRIBUNAL', 'OTHER');

-- CreateEnum
CREATE TYPE "app"."CaseStatus" AS ENUM ('ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "app"."PartySide" AS ENUM ('PETITIONER', 'RESPONDENT', 'OTHER');

-- CreateEnum
CREATE TYPE "app"."DocumentKind" AS ENUM ('ORDER', 'CAUSE_LIST', 'OTHER');

-- CreateEnum
CREATE TYPE "app"."TextSource" AS ENUM ('PDF_TEXT', 'OCR', 'PASTED', 'PLAIN_TEXT', 'NONE');

-- CreateEnum
CREATE TYPE "app"."JobStatus" AS ENUM ('NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "app"."Extractor" AS ENUM ('DEMO_RULES', 'ANTHROPIC', 'CASE_DIARY_IMPORT');

-- CreateEnum
CREATE TYPE "app"."HearingStatus" AS ENUM ('AWAITING_VERIFICATION', 'CONFIRMED', 'HELD', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "app"."TaskStatus" AS ENUM ('OPEN', 'DONE');

-- CreateEnum
CREATE TYPE "app"."TaskPriority" AS ENUM ('HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "app"."TaskSource" AS ENUM ('MANUAL', 'ORDER', 'RESEARCH', 'IMPORT');

-- CreateEnum
CREATE TYPE "app"."MessageStatus" AS ENUM ('DRAFT', 'APPROVED', 'HANDED_OFF');

-- CreateEnum
CREATE TYPE "app"."ResearchMode" AS ENUM ('DEMO', 'RULES', 'PARTIAL', 'LIVE');

-- CreateEnum
CREATE TYPE "app"."ReviewStatus" AS ENUM ('NEEDS_REVIEW', 'REVIEWED');

-- CreateEnum
CREATE TYPE "app"."Stance" AS ENUM ('SUPPORTS', 'LIMITS', 'CONTRADICTS', 'UNCLASSIFIED');

-- CreateEnum
CREATE TYPE "app"."Bindingness" AS ENUM ('BINDING', 'PERSUASIVE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "app"."Verification" AS ENUM ('FICTIONAL_DEMO', 'UNVERIFIED', 'SOURCE_RETRIEVED', 'ADVOCATE_REVIEWED');

-- CreateEnum
CREATE TYPE "app"."NoteAuthor" AS ENUM ('ADVOCATE', 'AI');

-- CreateTable
CREATE TABLE "app"."Office" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "demoLoaded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Office_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Membership" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "app"."Role" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Court" (
    "id" TEXT NOT NULL,
    "officeId" TEXT,
    "name" TEXT NOT NULL,
    "level" "app"."CourtLevel" NOT NULL,
    "state" TEXT,
    "district" TEXT,
    "bench" TEXT,
    "code" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Court_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Client" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "preferredLanguage" "app"."Language" NOT NULL DEFAULT 'EN',
    "preferredChannel" "app"."ContactChannel" NOT NULL DEFAULT 'WHATSAPP',
    "notes" TEXT NOT NULL DEFAULT '',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Case" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "numberKey" TEXT,
    "cnr" TEXT,
    "caseType" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "courtId" TEXT,
    "courtName" TEXT NOT NULL DEFAULT '',
    "stage" TEXT NOT NULL DEFAULT '',
    "status" "app"."CaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "actingFor" "app"."PartySide",
    "filedOn" DATE,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."CaseParty" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "side" "app"."PartySide" NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CaseParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."CaseClient" (
    "officeId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseClient_pkey" PRIMARY KEY ("caseId","clientId")
);

-- CreateTable
CREATE TABLE "app"."Document" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "caseId" TEXT,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "kind" "app"."DocumentKind" NOT NULL DEFAULT 'ORDER',
    "textExtract" TEXT,
    "textSource" "app"."TextSource" NOT NULL DEFAULT 'NONE',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."ExtractionJob" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "app"."JobStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "extractor" "app"."Extractor" NOT NULL,
    "model" TEXT,
    "hint" JSONB NOT NULL DEFAULT '{}',
    "extraction" JSONB,
    "match" JSONB,
    "conflicts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error" TEXT,
    "createdById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."CourtOrder" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "jobId" TEXT,
    "orderDate" DATE,
    "summary" TEXT NOT NULL DEFAULT '',
    "stage" TEXT NOT NULL DEFAULT '',
    "adjourned" BOOLEAN NOT NULL DEFAULT false,
    "costs" TEXT,
    "directions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nextHearingDate" DATE,
    "nextHearingConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "approvedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extractionSnapshot" JSONB,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CourtOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Hearing" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "status" "app"."HearingStatus" NOT NULL,
    "sourceOrderId" TEXT,
    "supersededById" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hearing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."HearingDateChange" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "orderId" TEXT,
    "affectedTaskIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HearingDateChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Task" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "dueDate" DATE,
    "priority" "app"."TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "app"."TaskStatus" NOT NULL DEFAULT 'OPEN',
    "source" "app"."TaskSource" NOT NULL DEFAULT 'MANUAL',
    "sourceOrderId" TEXT,
    "sourceVersionId" TEXT,
    "dedupeKey" TEXT,
    "assigneeId" TEXT,
    "rescheduleFrom" DATE,
    "rescheduleTo" DATE,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "completedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."ClientMessage" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "clientId" TEXT,
    "lang" "app"."Language" NOT NULL,
    "text" TEXT NOT NULL,
    "status" "app"."MessageStatus" NOT NULL DEFAULT 'DRAFT',
    "channel" "app"."ContactChannel",
    "sourceOrderId" TEXT,
    "handedOffAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ClientMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."ResearchReport" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."ResearchVersion" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "actingFor" "app"."PartySide",
    "mode" "app"."ResearchMode" NOT NULL,
    "pipeline" TEXT NOT NULL,
    "status" "app"."ReviewStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "summary" TEXT NOT NULL,
    "orderIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "documentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "issues" JSONB NOT NULL DEFAULT '[]',
    "provisions" JSONB NOT NULL DEFAULT '[]',
    "arguments" JSONB NOT NULL DEFAULT '[]',
    "counterarguments" JSONB NOT NULL DEFAULT '[]',
    "missingFacts" JSONB NOT NULL DEFAULT '[]',
    "nextSteps" JSONB NOT NULL DEFAULT '[]',
    "limitations" JSONB NOT NULL DEFAULT '[]',
    "sourcesChecked" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMPTZ(6),

    CONSTRAINT "ResearchVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."ResearchAuthority" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "judgmentId" TEXT,
    "name" TEXT NOT NULL,
    "citation" TEXT,
    "court" TEXT NOT NULL,
    "decisionDate" DATE,
    "bench" TEXT,
    "url" TEXT,
    "issue" TEXT NOT NULL DEFAULT '',
    "principle" TEXT NOT NULL DEFAULT '',
    "relevance" TEXT NOT NULL DEFAULT '',
    "distinctions" TEXT NOT NULL DEFAULT '',
    "passages" JSONB NOT NULL DEFAULT '[]',
    "stance" "app"."Stance" NOT NULL DEFAULT 'UNCLASSIFIED',
    "bindingness" "app"."Bindingness" NOT NULL DEFAULT 'UNKNOWN',
    "verification" "app"."Verification" NOT NULL,
    "isFictional" BOOLEAN NOT NULL DEFAULT false,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMPTZ(6),
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ResearchAuthority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."SavedAuthority" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorityId" TEXT NOT NULL,
    "savedById" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedAuthority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."ResearchNote" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "author" "app"."NoteAuthor" NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."AuditLog" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "caseId" TEXT,
    "detail" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "app"."User"("email");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "app"."Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_officeId_userId_key" ON "app"."Membership"("officeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_officeId_id_key" ON "app"."Membership"("officeId", "id");

-- CreateIndex
CREATE INDEX "Court_officeId_name_idx" ON "app"."Court"("officeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Court_code_key" ON "app"."Court"("code");

-- CreateIndex
CREATE INDEX "Client_officeId_name_idx" ON "app"."Client"("officeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Client_officeId_id_key" ON "app"."Client"("officeId", "id");

-- CreateIndex
CREATE INDEX "Case_officeId_status_updatedAt_idx" ON "app"."Case"("officeId", "status", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Case_officeId_id_key" ON "app"."Case"("officeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "case_office_number_live_uniq" ON "app"."Case"("officeId", "numberKey") WHERE ("numberKey" IS NOT NULL AND status <> 'ARCHIVED');

-- CreateIndex
CREATE UNIQUE INDEX "case_office_cnr_uniq" ON "app"."Case"("officeId", "cnr") WHERE (cnr IS NOT NULL);

-- CreateIndex
CREATE INDEX "CaseParty_officeId_caseId_side_position_idx" ON "app"."CaseParty"("officeId", "caseId", "side", "position");

-- CreateIndex
CREATE INDEX "CaseClient_officeId_clientId_idx" ON "app"."CaseClient"("officeId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "case_client_one_primary_uniq" ON "app"."CaseClient"("caseId") WHERE ("isPrimary");

-- CreateIndex
CREATE INDEX "Document_officeId_caseId_idx" ON "app"."Document"("officeId", "caseId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_officeId_id_key" ON "app"."Document"("officeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Document_officeId_sha256_key" ON "app"."Document"("officeId", "sha256");

-- CreateIndex
CREATE INDEX "ExtractionJob_officeId_status_createdAt_idx" ON "app"."ExtractionJob"("officeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ExtractionJob_officeId_idempotencyKey_idx" ON "app"."ExtractionJob"("officeId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionJob_officeId_id_key" ON "app"."ExtractionJob"("officeId", "id");

-- CreateIndex
CREATE INDEX "CourtOrder_officeId_caseId_orderDate_idx" ON "app"."CourtOrder"("officeId", "caseId", "orderDate");

-- CreateIndex
CREATE UNIQUE INDEX "CourtOrder_officeId_id_key" ON "app"."CourtOrder"("officeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CourtOrder_officeId_documentId_key" ON "app"."CourtOrder"("officeId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "CourtOrder_officeId_jobId_key" ON "app"."CourtOrder"("officeId", "jobId");

-- CreateIndex
CREATE INDEX "Hearing_officeId_date_idx" ON "app"."Hearing"("officeId", "date");

-- CreateIndex
CREATE INDEX "Hearing_officeId_caseId_status_idx" ON "app"."Hearing"("officeId", "caseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Hearing_officeId_id_key" ON "app"."Hearing"("officeId", "id");

-- CreateIndex
CREATE INDEX "HearingDateChange_officeId_caseId_createdAt_idx" ON "app"."HearingDateChange"("officeId", "caseId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_officeId_status_dueDate_idx" ON "app"."Task"("officeId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Task_officeId_caseId_idx" ON "app"."Task"("officeId", "caseId");

-- CreateIndex
CREATE UNIQUE INDEX "task_dedupe_uniq" ON "app"."Task"("officeId", "caseId", "dedupeKey") WHERE ("dedupeKey" IS NOT NULL);

-- CreateIndex
CREATE INDEX "ClientMessage_officeId_caseId_createdAt_idx" ON "app"."ClientMessage"("officeId", "caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "message_one_draft_per_order_lang_uniq" ON "app"."ClientMessage"("officeId", "sourceOrderId", "lang") WHERE ("sourceOrderId" IS NOT NULL);

-- CreateIndex
CREATE INDEX "ResearchReport_officeId_caseId_idx" ON "app"."ResearchReport"("officeId", "caseId");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchReport_officeId_id_key" ON "app"."ResearchReport"("officeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchVersion_officeId_id_key" ON "app"."ResearchVersion"("officeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchVersion_reportId_version_key" ON "app"."ResearchVersion"("reportId", "version");

-- CreateIndex
CREATE INDEX "ResearchAuthority_officeId_judgmentId_idx" ON "app"."ResearchAuthority"("officeId", "judgmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchAuthority_officeId_id_key" ON "app"."ResearchAuthority"("officeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchAuthority_versionId_sourceId_key" ON "app"."ResearchAuthority"("versionId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedAuthority_caseId_authorityId_key" ON "app"."SavedAuthority"("caseId", "authorityId");

-- CreateIndex
CREATE INDEX "ResearchNote_officeId_versionId_createdAt_idx" ON "app"."ResearchNote"("officeId", "versionId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_officeId_at_idx" ON "app"."AuditLog"("officeId", "at" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_officeId_caseId_at_idx" ON "app"."AuditLog"("officeId", "caseId", "at");

-- AddForeignKey
ALTER TABLE "app"."Membership" ADD CONSTRAINT "Membership_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "app"."Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Court" ADD CONSTRAINT "Court_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "app"."Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Client" ADD CONSTRAINT "Client_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "app"."Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Case" ADD CONSTRAINT "Case_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "app"."Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Case" ADD CONSTRAINT "Case_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "app"."Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."CaseParty" ADD CONSTRAINT "CaseParty_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "app"."Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."CaseParty" ADD CONSTRAINT "CaseParty_officeId_caseId_fkey" FOREIGN KEY ("officeId", "caseId") REFERENCES "app"."Case"("officeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."CaseClient" ADD CONSTRAINT "CaseClient_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "app"."Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."CaseClient" ADD CONSTRAINT "CaseClient_officeId_caseId_fkey" FOREIGN KEY ("officeId", "caseId") REFERENCES "app"."Case"("officeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."CaseClient" ADD CONSTRAINT "CaseClient_officeId_clientId_fkey" FOREIGN KEY ("officeId", "clientId") REFERENCES "app"."Client"("officeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Document" ADD CONSTRAINT "Document_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "app"."Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Document" ADD CONSTRAINT "Document_officeId_caseId_fkey" FOREIGN KEY ("officeId", "caseId") REFERENCES "app"."Case"("officeId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ExtractionJob" ADD CONSTRAINT "ExtractionJob_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "app"."Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ExtractionJob" ADD CONSTRAINT "ExtractionJob_officeId_documentId_fkey" FOREIGN KEY ("officeId", "documentId") REFERENCES "app"."Document"("officeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."CourtOrder" ADD CONSTRAINT "CourtOrder_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "app"."Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."CourtOrder" ADD CONSTRAINT "CourtOrder_officeId_caseId_fkey" FOREIGN KEY ("officeId", "caseId") REFERENCES "app"."Case"("officeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."CourtOrder" ADD CONSTRAINT "CourtOrder_officeId_documentId_fkey" FOREIGN KEY ("officeId", "documentId") REFERENCES "app"."Document"("officeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."CourtOrder" ADD CONSTRAINT "CourtOrder_officeId_jobId_fkey" FOREIGN KEY ("officeId", "jobId") REFERENCES "app"."ExtractionJob"("officeId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Hearing" ADD CONSTRAINT "Hearing_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "app"."Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Hearing" ADD CONSTRAINT "Hearing_officeId_caseId_fkey" FOREIGN KEY ("officeId", "caseId") REFERENCES "app"."Case"("officeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Hearing" ADD CONSTRAINT "Hearing_officeId_sourceOrderId_fkey" FOREIGN KEY ("officeId", "sourceOrderId") REFERENCES "app"."CourtOrder"("officeId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Hearing" ADD CONSTRAINT "Hearing_officeId_supersededById_fkey" FOREIGN KEY ("officeId", "supersededById") REFERENCES "app"."Hearing"("officeId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Hearing" ADD CONSTRAINT "Hearing_officeId_confirmedById_fkey" FOREIGN KEY ("officeId", "confirmedById") REFERENCES "app"."Membership"("officeId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."HearingDateChange" ADD CONSTRAINT "HearingDateChange_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "app"."Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."HearingDateChange" ADD CONSTRAINT "HearingDateChange_officeId_caseId_fkey" FOREIGN KEY ("officeId", "caseId") REFERENCES "app"."Case"("officeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."HearingDateChange" ADD CONSTRAINT "HearingDateChange_officeId_orderId_fkey" FOREIGN KEY ("officeId", "orderId") REFERENCES "app"."CourtOrder"("officeId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Task" ADD CONSTRAINT "Task_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "app"."Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Task" ADD CONSTRAINT "Task_officeId_caseId_fkey" FOREIGN KEY ("officeId", "caseId") REFERENCES "app"."Case"("officeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Task" ADD CONSTRAINT "Task_officeId_sourceOrderId_fkey" FOREIGN KEY ("officeId", "sourceOrderId") REFERENCES "app"."CourtOrder"("officeId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Task" ADD CONSTRAINT "Task_officeId_sourceVersionId_fkey" FOREIGN KEY ("officeId", "sourceVersionId") REFERENCES "app"."ResearchVersion"("officeId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Task" ADD CONSTRAINT "Task_officeId_assigneeId_fkey" FOREIGN KEY ("officeId", "assigneeId") REFERENCES "app"."Membership"("officeId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ClientMessage" ADD CONSTRAINT "ClientMessage_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "app"."Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ClientMessage" ADD CONSTRAINT "ClientMessage_officeId_caseId_fkey" FOREIGN KEY ("officeId", "caseId") REFERENCES "app"."Case"("officeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ClientMessage" ADD CONSTRAINT "ClientMessage_officeId_clientId_fkey" FOREIGN KEY ("officeId", "clientId") REFERENCES "app"."Client"("officeId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ClientMessage" ADD CONSTRAINT "ClientMessage_officeId_sourceOrderId_fkey" FOREIGN KEY ("officeId", "sourceOrderId") REFERENCES "app"."CourtOrder"("officeId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ResearchReport" ADD CONSTRAINT "ResearchReport_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "app"."Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ResearchReport" ADD CONSTRAINT "ResearchReport_officeId_caseId_fkey" FOREIGN KEY ("officeId", "caseId") REFERENCES "app"."Case"("officeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ResearchVersion" ADD CONSTRAINT "ResearchVersion_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "app"."Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ResearchVersion" ADD CONSTRAINT "ResearchVersion_officeId_reportId_fkey" FOREIGN KEY ("officeId", "reportId") REFERENCES "app"."ResearchReport"("officeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ResearchAuthority" ADD CONSTRAINT "ResearchAuthority_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "app"."Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ResearchAuthority" ADD CONSTRAINT "ResearchAuthority_officeId_versionId_fkey" FOREIGN KEY ("officeId", "versionId") REFERENCES "app"."ResearchVersion"("officeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."SavedAuthority" ADD CONSTRAINT "SavedAuthority_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "app"."Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."SavedAuthority" ADD CONSTRAINT "SavedAuthority_officeId_caseId_fkey" FOREIGN KEY ("officeId", "caseId") REFERENCES "app"."Case"("officeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."SavedAuthority" ADD CONSTRAINT "SavedAuthority_officeId_authorityId_fkey" FOREIGN KEY ("officeId", "authorityId") REFERENCES "app"."ResearchAuthority"("officeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ResearchNote" ADD CONSTRAINT "ResearchNote_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "app"."Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ResearchNote" ADD CONSTRAINT "ResearchNote_officeId_versionId_fkey" FOREIGN KEY ("officeId", "versionId") REFERENCES "app"."ResearchVersion"("officeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."AuditLog" ADD CONSTRAINT "AuditLog_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "app"."Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

