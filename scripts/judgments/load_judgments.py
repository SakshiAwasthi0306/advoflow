"""
Load real judgments from the public eCourts open datasets into the legal_judgments table.

Sources (published by Dattam Labs on the AWS Open Data registry, licence CC-BY-4.0, no AWS account needed):
  s3://indian-supreme-court-judgments  Supreme Court of India, reported judgments (SCR), 1950-
  s3://indian-high-court-judgments     25 High Courts; this script reads only the High Court of Karnataka (court=29_3)

Supreme Court: metadata from parquet + the "Issue for Consideration" / headnotes text from the first pages of each PDF.
Karnataka HC:  metadata only (title, opening lines, judges, CNR, neutral citation, outcome). PDFs are linked, not read.

Usage (from the advoflow project folder):
  python3 -m venv .venv-judgments && .venv-judgments/bin/pip install -r scripts/judgments/requirements.txt
  DATABASE_URL_UNPOOLED=postgres://... .venv-judgments/bin/python scripts/judgments/load_judgments.py --sc-from 2010 --khc-from 2025

Re-running is safe: rows are upserted by id, and Supreme Court PDFs already loaded are skipped.
"""
import argparse
import os
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import duckdb
import fitz  # PyMuPDF
import psycopg

SC_BUCKET = "indian-supreme-court-judgments"
HC_BUCKET = "indian-high-court-judgments"
S3_HTTP = "https://{bucket}.s3.ap-south-1.amazonaws.com/{key}"
KHC_SEATS = {"karnataka_bng_old": "Bengaluru", "karhcdharwad": "Dharwad", "karhckalaburagi": "Kalaburagi"}
# Outcomes that say nothing about the law; left out to save space.
KHC_SKIP_DISPOSALS = ("Dismissed for Non-Prosecution", "DROPPED", "Abated", "")
SC_TEXT_CHARS = 3500

COLUMNS = ["id", "source", "court", "bench", "title", "citation", "neutral_citation", "cnr", "case_type",
           "decision_date", "disposal", "text", "text_kind", "pdf_url", "dataset"]


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def ddmmyyyy(s):
    try:
        return datetime.strptime(s.strip(), "%d-%m-%Y").date() if s else None
    except ValueError:
        return None


def clean(s):
    return re.sub(r"\s+", " ", s or "").strip()


def duck():
    c = duckdb.connect()
    c.sql("INSTALL httpfs; LOAD httpfs; SET s3_region='ap-south-1';")
    return c


# ---------------------------------------------------------------- Supreme Court

def sc_headnotes(pdf_bytes):
    """Issue for Consideration + Headnotes from the start of an SCR-format judgment."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    raw = "\n".join(doc[i].get_text() for i in range(min(3, doc.page_count)))
    doc.close()
    # Drop running page headers such as "[2024] 10 S.C.R. 109" and footnote markers.
    raw = re.sub(r"^\s*\[\d{4}\]\s+\d+\s+S\.C\.R\.\s*\d*\s*$", "", raw, flags=re.M)
    text = clean(raw.replace("†", ""))
    start = text.find("Issue for Consideration")
    if start < 0:
        start = text.find("Headnote")
    if start > 0:
        text = text[start:]
    elif start < 0:
        # Older SCR volumes: margin letters "A B C ..." and a running head precede the bench line, then the headnote.
        text = clean(re.sub(r"(?:\b[A-H]\b\s+){3,}", " ", text))
        bench = re.search(r"\[[^\]]{3,300}?\b(?:JJ|J|CJI)\s*\.?\s*[\])]", text[:900])
        if bench:
            text = text[bench.end():].strip()
    for stop in ("Case Law Cited", "List of Acts", "List of Keywords", "Case Arising From", "Appearances for Parties"):
        i = text.find(stop)
        if i > 200:
            text = text[:i]
    return text[:SC_TEXT_CHARS].strip()


def fetch(url, tries=3):
    for n in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if n == tries - 1:
                raise e
            time.sleep(2 * (n + 1))


def load_sc(conn, year_from, year_to, workers, refresh=False):
    c = duck()
    rows = c.sql(f"""
        SELECT path, title, judge, citation, case_id, cnr, decision_date, disposal_nature, CAST(year AS INT) AS y
        FROM read_parquet('s3://{SC_BUCKET}/metadata/parquet/year=*/metadata.parquet', union_by_name=true)
        WHERE CAST(year AS INT) BETWEEN {year_from} AND {year_to} AND path IS NOT NULL AND path <> ''
    """).fetchall()
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM legal_judgments WHERE source='sc'")
        done = {r[0] for r in cur.fetchall()}
    todo = [r for r in rows if f"sc:{r[0]}" not in done or refresh]
    log(f"Supreme Court {year_from}-{year_to}: {len(rows)} judgments, {len(rows) - len(todo)} already loaded, {len(todo)} to fetch")

    def work(r):
        path, title, judge, citation, neutral, cnr, ddate, disposal, y = r
        pdf_url = S3_HTTP.format(bucket=SC_BUCKET, key=f"data/pdf/year={y}/english/{path}_EN.pdf")
        text = sc_headnotes(fetch(pdf_url))
        if len(text) < 80:
            raise ValueError("no headnote text found")
        return ("sc:" + path, "sc", "Supreme Court of India", f"Judgment by {clean(judge)}" if clean(judge) else None,
                clean(title).replace(" versus ", " v. "), clean(citation) or None, clean(neutral) or None,
                clean(cnr) or None, None, ddmmyyyy(ddate), clean(disposal) or None, text, "headnotes", pdf_url, SC_BUCKET)

    batch, failed = [], 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = [ex.submit(work, r) for r in todo]
        for i, f in enumerate(as_completed(futures), 1):
            try:
                batch.append(f.result())
            except Exception:  # noqa: BLE001
                failed += 1
            if len(batch) >= 250:
                upsert(conn, batch)
                batch = []
            if i % 500 == 0:
                log(f"  Supreme Court: {i}/{len(todo)} processed, {failed} without usable text")
    upsert(conn, batch)
    log(f"Supreme Court done: {len(todo) - failed} loaded, {failed} skipped (PDF missing or no headnotes)")


# ---------------------------------------------------------------- Karnataka High Court

def load_khc(conn, year_from, year_to):
    c = duck()
    skip = ", ".join("'" + s.replace("'", "''") + "'" for s in KHC_SKIP_DISPOSALS)
    rows = c.sql(f"""
        SELECT title, description, judge, pdf_link, cnr, decision_date, disposal_nature, bench, year
        FROM read_parquet('s3://{HC_BUCKET}/metadata/parquet/year=*/court=29_3/bench=*/metadata.parquet', hive_partitioning=true, union_by_name=true)
        WHERE year BETWEEN {year_from} AND {year_to} AND coalesce(disposal_nature, '') NOT IN ({skip})
    """).fetchall()
    log(f"Karnataka High Court {year_from}-{year_to}: {len(rows)} decided matters")
    batch = []
    for title, desc, judge, pdf_link, cnr, ddate, disposal, bench, year in rows:
        if not pdf_link:
            continue
        stem = os.path.basename(pdf_link)
        desc = clean(desc)
        neutral = re.match(r"(\d{4}:KHC(?:-[A-Z])?:\d+(?:-DB)?)", desc)
        ctype = re.match(r"([A-Z.()]+)/", clean(title))
        subject = re.search(r"\(([A-Z][A-Z0-9/ .-]{1,30})\)\s*BETWEEN", desc)
        seat = KHC_SEATS.get(bench, bench)
        batch.append((
            "khc:" + stem.rsplit(".", 1)[0], "khc", "High Court of Karnataka",
            f"{seat} bench" + (f": {clean(judge)}" if judge else ""),
            clean(title).replace(" Vs ", " v. "), None, neutral.group(1) if neutral else None, clean(cnr) or None,
            " ".join(x for x in [ctype.group(1) if ctype else None, subject.group(1) if subject else None] if x) or None,
            ddate.date() if ddate else None, clean(disposal) or None, desc or clean(title), "opening_lines",
            S3_HTTP.format(bucket=HC_BUCKET, key=f"data/pdf/year={year}/court=29_3/bench={bench}/{stem}"), HC_BUCKET,
        ))
        if len(batch) >= 2000:
            upsert(conn, batch)
            batch = []
    upsert(conn, batch)
    log("Karnataka High Court done")


# ---------------------------------------------------------------- DB

def upsert(conn, rows):
    if not rows:
        return
    cols = ", ".join(COLUMNS)
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in COLUMNS if c != "id")
    with conn.cursor() as cur:
        cur.executemany(
            f"INSERT INTO legal_judgments ({cols}) VALUES ({', '.join(['%s'] * len(COLUMNS))}) "
            f"ON CONFLICT (id) DO UPDATE SET {updates}, loaded_at = now()",
            rows,
        )
    conn.commit()


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--sc-from", type=int, default=2010)
    p.add_argument("--sc-to", type=int, default=datetime.now().year)
    p.add_argument("--khc-from", type=int, default=2025)
    p.add_argument("--khc-to", type=int, default=datetime.now().year)
    p.add_argument("--skip-sc", action="store_true")
    p.add_argument("--skip-khc", action="store_true")
    p.add_argument("--workers", type=int, default=16)
    p.add_argument("--refresh", action="store_true", help="Re-read Supreme Court PDFs that are already loaded")
    a = p.parse_args()
    url = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("Set DATABASE_URL_UNPOOLED (or DATABASE_URL) first, and run `npm run db:migrate`.")
    with psycopg.connect(url) as conn:
        if not a.skip_khc:
            load_khc(conn, a.khc_from, a.khc_to)
        if not a.skip_sc:
            load_sc(conn, a.sc_from, a.sc_to, a.workers, a.refresh)
        with conn.cursor() as cur:
            cur.execute("SELECT source, count(*), min(decision_date), max(decision_date) FROM legal_judgments GROUP BY source ORDER BY source")
            for r in cur.fetchall():
                log("  ", r)
            cur.execute("SELECT pg_size_pretty(pg_total_relation_size('legal_judgments'))")
            log("   table size:", cur.fetchone()[0])


if __name__ == "__main__":
    main()
