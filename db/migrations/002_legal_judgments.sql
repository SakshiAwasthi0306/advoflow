-- Real judgments from the public eCourts open datasets (Dattam Labs, CC-BY-4.0), loaded by scripts/judgments/load_judgments.py.
-- Shared reference data: not office-scoped, read-only for the app.
CREATE TABLE legal_judgments (
  id               TEXT PRIMARY KEY,           -- "sc:<path>" or "khc:<pdf file stem>"
  source           TEXT NOT NULL CHECK (source IN ('sc', 'khc')),
  court            TEXT NOT NULL,
  bench            TEXT,                       -- Supreme Court: judges; Karnataka HC: seat (Bengaluru / Dharwad / Kalaburagi) and judges
  title            TEXT NOT NULL,
  citation         TEXT,                       -- e.g. "[2024] 10 S.C.R. 108"
  neutral_citation TEXT,                       -- e.g. "2024 INSC 735", "2024:KHC-K:6372"
  cnr              TEXT,
  case_type        TEXT,
  decision_date    DATE,
  disposal         TEXT,
  text             TEXT NOT NULL,              -- Supreme Court: issue + headnotes from the reported judgment; Karnataka HC: opening lines
  text_kind        TEXT NOT NULL CHECK (text_kind IN ('headnotes', 'opening_lines')),
  pdf_url          TEXT,
  dataset          TEXT NOT NULL,              -- e.g. "indian-supreme-court-judgments"
  loaded_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  search           TSVECTOR GENERATED ALWAYS AS (
                     setweight(to_tsvector('english', coalesce(text, '')), 'A') ||
                     setweight(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(case_type, '')), 'B')
                   ) STORED
);
CREATE INDEX legal_judgments_search_idx ON legal_judgments USING GIN (search);
CREATE INDEX legal_judgments_source_date_idx ON legal_judgments (source, decision_date DESC);
