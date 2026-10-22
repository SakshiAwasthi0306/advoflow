import { describe, it, expect } from "vitest";
import { judgmentPassages, rowToDoc, type JudgmentRow } from "@/lib/research/connectors";
import { demoIssues } from "@/lib/research/demo-rules";
import { DEMO_CORPUS } from "@/lib/research/demo-corpus";
import type { Authority, CaseRecord, CourtOrder } from "@/lib/types";

// Shapes match rows produced by scripts/judgments/load_judgments.py. Text is abbreviated sample wording.
const sc: JudgmentRow = {
  id: "sc:2024_10_108_125", source: "sc", court: "Supreme Court of India", bench: "Judgment by BELA M. TRIVEDI",
  title: "VIJAY SINGH @ VIJAY KR. SHARMA v. THE STATE OF BIHAR", citation: "[2024] 10 S.C.R. 108", neutral_citation: "2024 INSC 735",
  decision_date: "2024-09-25", text_kind: "headnotes", pdf_url: "https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com/data/pdf/year=2024/english/2024_10_108_125_EN.pdf",
  text: "Issue for Consideration Issue arose as regards sustainability of the findings of the High Court. Headnotes Penal Code, 1860 – ss. 302/34 – Held: chain of circumstantial evidence must be complete.",
  matched: ["evid", "circumstanti"],
};
const khc: JudgmentRow = {
  id: "khc:KAHC030025932024_1_2024-08-28", source: "khc", court: "High Court of Karnataka", bench: "Kalaburagi bench: SURAJ GOVINDARAJ",
  title: "WP/201090/2024 of KRISHNAREDDY AND ANR v. THE COMMISSIONER OF POLICE AND ORS", citation: null, neutral_citation: "2024:KHC-K:6372",
  decision_date: "2024-08-28", text_kind: "opening_lines", pdf_url: null, text: "2024:KHC-K:6372 WP No. 201090 of 2024 IN THE HIGH COURT OF KARNATAKA, KALABURAGI BENCH", matched: ["writ"],
};

const caseRecord = { id: "c1", number: "O.S. 1/2025", title: "A v. B", court: "", stage: "Written statement" } as unknown as CaseRecord;
const order = { id: "o1", caseId: "c1", orderDate: "2026-10-01", stage: "Written statement", summary: "Defendant sought time to file written statement. Last chance with costs.", adjourned: true, costs: "Rs. 500", directions: [], nextHearingDate: "2026-10-20" } as unknown as CourtOrder;

describe("eCourts open-data connector", () => {
  it("splits Supreme Court headnote text into labelled passages and keeps source metadata", () => {
    const d = rowToDoc(sc);
    expect(d.fictional).toBe(false);
    expect(d.citation).toBe("[2024] 10 S.C.R. 108; 2024 INSC 735");
    expect(d.decisionDate).toBe("2024-09-25");
    expect(d.url).toContain("indian-supreme-court-judgments");
    expect(d.passages.map((p) => p.locator)).toEqual(["Issue for Consideration (SCR)", "Headnotes (SCR), first part"]);
    expect(d.passages[0].text.startsWith("Issue arose")).toBe(true);
    expect(d.passages[1].text.startsWith("Penal Code")).toBe(true);
  });

  it("labels Karnataka High Court text as opening lines only", () => {
    const d = rowToDoc(khc);
    expect(d.citation).toBe("2024:KHC-K:6372");
    expect(d.passages).toHaveLength(1);
    expect(d.passages[0].locator).toMatch(/Opening lines/);
  });

  it("drops the margin letters and running head of older SCR volumes", () => {
    const old = "A B C D E F G H 14 SUPREME COURT REPORTS DESH RAJ v. BALKISHAN (Civil Appeal No. 433 of 2020) JANUARY 20, 2020 [S. A. BOBDE, CJI, B. R. GAVAI AND SURYA KANT, JJ.] Code of Civil Procedure, 1908 – Order VIII Rule 1 – written statement.";
    const p = judgmentPassages(old, "headnotes");
    expect(p).toHaveLength(1);
    expect(p[0].text.startsWith("Code of Civil Procedure, 1908")).toBe(true);
    expect(p[0].locator).toBe("Headnote (SCR), first part");
  });

  it("cuts long passages at a word boundary", () => {
    const p = judgmentPassages(`Issue for Consideration ${"word ".repeat(400)}`, "headnotes");
    expect(p[0].text.length).toBeLessThan(905);
    expect(p[0].text.endsWith("…")).toBe(true);
  });

  it("without AI, real judgments are listed as not analysed: no stance, principle or arguments are invented", () => {
    const rules = demoIssues({ caseRecord, orders: [order], documents: [], question: "", actingFor: "petitioner", createdBy: "u1" });
    const doc = rowToDoc(sc);
    expect(rules.relevant([doc])).toHaveLength(1);
    const a = rules.annotate(doc);
    expect(a.stance).toBe("unclassified");
    expect(a.principle).toBe("");
    expect(a.relevance).toMatch(/Not analysed/);
    expect(a.relevance).toMatch(/evid, circumstanti/);
    expect(JSON.stringify(a)).not.toMatch(/fictional/i);
    const built = rules.build([{ ...a, id: "a1", name: doc.title, citation: doc.citation, fictional: false, passages: doc.passages } as Authority]);
    expect(built.arguments).toHaveLength(0);
    expect(built.counterarguments).toHaveLength(0);
    expect(built.summary).toMatch(/1 real judgment was found by keyword search/);
    expect(built.summary).not.toMatch(/fictional/i);
  });

  it("the fictional demo corpus is still annotated and labelled as fictional", () => {
    const rules = demoIssues({ caseRecord, orders: [order], documents: [], question: "", actingFor: "petitioner", createdBy: "u1" });
    const demo = DEMO_CORPUS.map((x) => x.doc).filter((d) => rules.relevant([d]).length);
    expect(demo.length).toBeGreaterThan(0);
    const a = rules.annotate(demo[0]);
    expect(a.stance).not.toBe("unclassified");
    expect(rules.build([{ ...a, id: "a1", name: demo[0].title, fictional: true, passages: demo[0].passages } as Authority]).summary).toMatch(/fictional/i);
  });
});
