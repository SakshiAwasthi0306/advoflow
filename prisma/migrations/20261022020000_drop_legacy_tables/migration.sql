-- Step 3, stage B: remove the pre-Prisma tables in "public" (the app has used schema "app" since 20261022010000).
-- They held only the fictional demo office. A Neon backup branch of production was taken first
-- (backup-before-legacy-drop-2026-10-22). public.legal_judgments (shared judgments) is NOT touched.
-- IF EXISTS: databases created after Step 3 never had these tables.
DROP TABLE IF EXISTS
  public.saved_authorities,
  public.research_notes,
  public.source_passages,
  public.judicial_authorities,
  public.statutory_provisions,
  public.legal_issues,
  public.research_report_versions,
  public.research_reports,
  public.client_updates,
  public.tasks,
  public.date_changes,
  public.hearings,
  public.court_orders,
  public.processing_jobs,
  public.documents,
  public.cases,
  public.clients,
  public.office_memberships,
  public.users,
  public.audit_logs,
  public.offices,
  public.schema_migrations;
