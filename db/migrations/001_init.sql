-- AdvoFlow relational schema (PostgreSQL 14+).
-- Every office-owned table carries office_id; the application only ever queries
-- with the office_id taken from the verified session.
-- Typed columns hold what is indexed, constrained or joined on; `data` holds the full record.

CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE offices (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 0,
  demo_loaded   BOOLEAN NOT NULL DEFAULT false,
  members       JSONB NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE office_memberships (
  office_id  TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('owner','advocate','clerk','viewer')),
  PRIMARY KEY (office_id, user_id)
);

CREATE TABLE clients (
  id         TEXT PRIMARY KEY,
  office_id  TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX clients_office_idx ON clients(office_id);

CREATE TABLE cases (
  id          TEXT PRIMARY KEY,
  office_id   TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  number_key  TEXT,
  status      TEXT NOT NULL CHECK (status IN ('active','closed','archived')),
  client_id   TEXT REFERENCES clients(id) ON DELETE SET NULL,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cases_office_idx ON cases(office_id);
-- One live case per normalised number in an office (duplicate prevention).
CREATE UNIQUE INDEX cases_office_number_uniq ON cases(office_id, number_key) WHERE number_key IS NOT NULL AND status <> 'archived';

CREATE TABLE documents (
  id         TEXT PRIMARY KEY,
  office_id  TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  case_id    TEXT REFERENCES cases(id) ON DELETE SET NULL,
  sha256     TEXT NOT NULL,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX documents_office_sha_idx ON documents(office_id, sha256);

CREATE TABLE processing_jobs (
  id               TEXT PRIMARY KEY,
  office_id        TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  document_id      TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  idempotency_key  TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('needs_review','approved','rejected','failed')),
  data             JSONB NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX jobs_office_key_idx ON processing_jobs(office_id, idempotency_key);

CREATE TABLE court_orders (
  id          TEXT PRIMARY KEY,
  office_id   TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  case_id     TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id),
  order_date  DATE,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_case_idx ON court_orders(office_id, case_id, order_date);
-- The same document can only become one approved order (idempotent approval).
CREATE UNIQUE INDEX orders_document_uniq ON court_orders(office_id, document_id);

CREATE TABLE hearings (
  id           TEXT PRIMARY KEY,
  office_id    TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  case_id      TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  hearing_date DATE NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('awaiting_verification','confirmed','superseded','cancelled','held')),
  data         JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX hearings_date_idx ON hearings(office_id, hearing_date);

CREATE TABLE date_changes (
  id         TEXT PRIMARY KEY,
  office_id  TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  case_id    TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id          TEXT PRIMARY KEY,
  office_id   TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  case_id     TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  due_date    DATE,
  status      TEXT NOT NULL CHECK (status IN ('open','done')),
  dedupe_key  TEXT,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tasks_due_idx ON tasks(office_id, status, due_date);
-- Retried processing cannot create the same task twice.
CREATE UNIQUE INDEX tasks_dedupe_uniq ON tasks(office_id, case_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE client_updates (
  id         TEXT PRIMARY KEY,
  office_id  TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  case_id    TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE research_reports (
  id         TEXT PRIMARY KEY,
  office_id  TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  case_id    TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Versions are never overwritten by a new research run; a rerun adds a row.
CREATE TABLE research_report_versions (
  report_id  TEXT NOT NULL REFERENCES research_reports(id) ON DELETE CASCADE,
  office_id  TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  mode       TEXT NOT NULL,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, version)
);

-- Queryable projections of each report version (rebuilt when that version is saved).
CREATE TABLE legal_issues (
  report_id TEXT NOT NULL, version INTEGER NOT NULL, item_id TEXT NOT NULL,
  office_id TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE, data JSONB NOT NULL,
  PRIMARY KEY (report_id, version, item_id),
  FOREIGN KEY (report_id, version) REFERENCES research_report_versions(report_id, version) ON DELETE CASCADE
);
CREATE TABLE statutory_provisions (
  report_id TEXT NOT NULL, version INTEGER NOT NULL, item_id TEXT NOT NULL,
  office_id TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE, verification TEXT NOT NULL, data JSONB NOT NULL,
  PRIMARY KEY (report_id, version, item_id),
  FOREIGN KEY (report_id, version) REFERENCES research_report_versions(report_id, version) ON DELETE CASCADE
);
CREATE TABLE judicial_authorities (
  report_id TEXT NOT NULL, version INTEGER NOT NULL, item_id TEXT NOT NULL,
  office_id TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE, verification TEXT NOT NULL, fictional BOOLEAN NOT NULL, data JSONB NOT NULL,
  PRIMARY KEY (report_id, version, item_id),
  FOREIGN KEY (report_id, version) REFERENCES research_report_versions(report_id, version) ON DELETE CASCADE
);
CREATE TABLE source_passages (
  report_id TEXT NOT NULL, version INTEGER NOT NULL, authority_id TEXT NOT NULL, item_id TEXT NOT NULL,
  office_id TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE, data JSONB NOT NULL,
  PRIMARY KEY (report_id, version, authority_id, item_id),
  FOREIGN KEY (report_id, version) REFERENCES research_report_versions(report_id, version) ON DELETE CASCADE
);
CREATE TABLE saved_authorities (
  report_id TEXT NOT NULL, version INTEGER NOT NULL, item_id TEXT NOT NULL,
  office_id TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  PRIMARY KEY (report_id, version, item_id),
  FOREIGN KEY (report_id, version) REFERENCES research_report_versions(report_id, version) ON DELETE CASCADE
);
CREATE TABLE research_notes (
  report_id TEXT NOT NULL, version INTEGER NOT NULL, item_id TEXT NOT NULL,
  office_id TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE, author TEXT NOT NULL, data JSONB NOT NULL,
  PRIMARY KEY (report_id, version, item_id),
  FOREIGN KEY (report_id, version) REFERENCES research_report_versions(report_id, version) ON DELETE CASCADE
);

-- Append-only audit trail. The application never updates or deletes rows here.
CREATE TABLE audit_logs (
  id        TEXT PRIMARY KEY,
  office_id TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  case_id   TEXT,
  at        TIMESTAMPTZ NOT NULL,
  action    TEXT NOT NULL,
  data      JSONB NOT NULL
);
CREATE INDEX audit_office_at_idx ON audit_logs(office_id, at DESC);
