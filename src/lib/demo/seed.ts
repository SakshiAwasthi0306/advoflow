import type { ApproveInput } from "../schemas";
import type { DocumentRecord, Extraction, Session, Workspace } from "../types";
import { addDays, newId, nowISO, sha256, todayIST } from "../util";
import { demoExtract } from "../extraction/demo-extractor";
import { approveJob, createJob, resolveReschedule } from "../services/orders";
import { createTask, linkClient, updateTask, upsertClient } from "../services/cases";
import { saveResearchVersion } from "../services/research";
import { audit, requireRole } from "../services/workspace";
import { DEMO_CORPUS } from "../research/demo-corpus";
import { demoIssues } from "../research/demo-rules";
import type { RetrievedDoc } from "../research/connectors";

// ⚠️ All demo cases, parties, clients, phone numbers and judgments are FICTIONAL.

const ddmmyyyy = (d: string) => d.split("-").reverse().join("-");

export function demoOrders(today = todayIST()) {
  const t = (n: number) => addDays(today, n);
  return {
    os1: `IN THE COURT OF THE XII ADDITIONAL CITY CIVIL JUDGE, BENGALURU
O.S. No. 482/2025
CNR: KABC010048202025
Ramesh Kumar v. Suresh Rao
Date: ${ddmmyyyy(t(-30))}
Plaintiff's counsel present. Defendant appeared through counsel and sought time to file written statement. Time granted. Defendant to file written statement on or before the next date. Adjourned to ${ddmmyyyy(t(-9))} for written statement.`,
    os2: `IN THE COURT OF THE XII ADDITIONAL CITY CIVIL JUDGE, BENGALURU
O.S. No. 482/2025
CNR: KABC010048202025
Ramesh Kumar v. Suresh Rao
Date: ${ddmmyyyy(t(-9))}
Plaintiff's counsel present. Defendant's counsel sought further time to file written statement. Time granted as a last chance, subject to costs of Rs. 500 payable to the plaintiff. Defendant to file written statement on or before the next date. Adjourned to ${ddmmyyyy(t(5))} for written statement.`,
    os3: `IN THE COURT OF THE XII ADDITIONAL CITY CIVIL JUDGE, BENGALURU
O.S. No. 482/2025
CNR: KABC010048202025
Ramesh Kumar v. Suresh Rao
Date: ${ddmmyyyy(t(-3))}
Office note: As the Presiding Officer is on leave on ${ddmmyyyy(t(5))}, the matter is re-listed. Call on ${ddmmyyyy(t(7))} for written statement.`,
    wp1: `IN THE HIGH COURT OF KARNATAKA AT BENGALURU
W.P. No. 12345/2024
Lakshmi Devi v. State of Karnataka and others
Date: ${ddmmyyyy(t(-14))}
Learned counsel for the petitioner present. Learned Government Pleader accepts notice for respondents 1 and 2. Respondents are directed to file statement of objections. Interim order granted earlier is extended till the next date. List on ${ddmmyyyy(t(0))} for objections.`,
    wp2: `IN THE HIGH COURT OF KARNATAKA AT BENGALURU
W.P. No. 12345/2024
Lakshmi Devi v. State of Karnataka and others
Date: ${ddmmyyyy(t(0))}
Statement of objections filed by respondents 1 and 2. Petitioner may file rejoinder, if any. List after two weeks for hearing.`,
    os77a: `IN THE COURT OF THE PRINCIPAL CIVIL JUDGE, MYSURU
O.S. No. 77/2023
Anand Kumar v. Prakash Kumar
Date: ${ddmmyyyy(t(-60))}
Plaintiff absent. Plaintiff's evidence not ready. Adjourned to ${ddmmyyyy(t(-40))} for plaintiff's evidence.`,
    os77b: `IN THE COURT OF THE PRINCIPAL CIVIL JUDGE, MYSURU
O.S. No. 77/2023
Anand Kumar v. Prakash Kumar
Date: ${ddmmyyyy(t(-40))}
Plaintiff sought time to file affidavit in lieu of chief examination. Adjourned to ${ddmmyyyy(t(-20))} for plaintiff's evidence.`,
    os77c: `IN THE COURT OF THE PRINCIPAL CIVIL JUDGE, MYSURU
O.S. No. 77/2023
Anand Kumar v. Prakash Kumar
Date: ${ddmmyyyy(t(-20))}
Plaintiff's counsel seeks further time. Last opportunity granted, with costs of Rs. 1,000. Adjourned to ${ddmmyyyy(t(12))} for plaintiff's evidence.`,
  };
}

function approveAll(ex: Extraction, caseId: string | null, number: string): ApproveInput {
  const f = <T,>(v: { value: T | null }) => ({ approved: v.value !== null, value: v.value });
  return {
    caseDecision: caseId ? { mode: "existing", caseId } : { mode: "new", number, title: ex.title.value ?? "", court: ex.court.value ?? "", caseType: "" },
    fields: { orderDate: f(ex.orderDate), nextHearingDate: f(ex.nextHearingDate), stage: f(ex.stage), summary: f(ex.summary), adjourned: f(ex.adjourned), costs: f(ex.costs), court: f(ex.court), title: f(ex.title) },
    confirmHearing: true,
    directions: ex.directions,
    tasks: ex.tasks.filter((t) => t.key !== "update client").map((t) => ({ key: t.key, approved: true, title: t.title, dueDate: t.dueDate, priority: t.priority })),
  };
}

export async function seedDemo(ws: Workspace, session: Session, put: (sha: string, bytes: Uint8Array) => Promise<string>) {
  requireRole(session, "owner");
  const today = todayIST();
  const o = demoOrders(today);

  const doc = async (name: string, text: string): Promise<DocumentRecord> => {
    const bytes = new TextEncoder().encode(text);
    const sha = sha256(bytes);
    return { id: newId("doc"), caseId: null, filename: `DEMO ${name}.txt`, mime: "text/plain", size: bytes.length, sha256: sha, storageKey: await put(sha, bytes), kind: "order", textExtract: text, textSource: "pasted", isDemo: true, uploadedBy: session.userId, createdAt: nowISO() };
  };
  const ingest = async (name: string, text: string, approve: boolean, caseId: string | null) => {
    const d = await doc(name, text);
    const ex = demoExtract(text);
    const { job } = createJob(ws, session, { doc: d, idempotencyKey: d.sha256, hint: { caseNumber: "", court: "", context: "Demo" }, extraction: ex, error: null });
    if (!approve) return { job, caseId };
    const r = approveJob(ws, session, job.id, approveAll(ex, caseId ?? job.match?.caseId ?? null, ex.caseNumber.value!));
    return { job, caseId: r.caseId };
  };

  const ramesh = upsertClient(ws, session, { name: "Ramesh Kumar (demo)", phone: "9000000001", email: "", preferredLanguage: "kn", preferredChannel: "whatsapp", notes: "Fictional demo client." });
  const lakshmi = upsertClient(ws, session, { name: "Lakshmi Devi (demo)", phone: "9000000002", email: "", preferredLanguage: "en", preferredChannel: "phone", notes: "Fictional demo client." });
  ramesh.isDemo = lakshmi.isDemo = true;

  // Case 1: written-statement stage, with a later re-listing (date change).
  const a = await ingest("O.S. 482-2025 order 1", o.os1, true, null);
  const c1 = a.caseId!;
  linkClient(ws, session, c1, ramesh.id);
  await ingest("O.S. 482-2025 order 2", o.os2, true, c1);
  await ingest("O.S. 482-2025 office note", o.os3, true, c1);

  // Case 2: High Court writ, objections stage; the latest order is left for review (relative date, no calendar date).
  const b = await ingest("W.P. 12345-2024 order 1", o.wp1, true, null);
  const c2 = b.caseId!;
  linkClient(ws, session, c2, lakshmi.id);
  await ingest("W.P. 12345-2024 order 2", o.wp2, false, c2);

  // Case 3: repeated adjournments at the evidence stage.
  const c = await ingest("O.S. 77-2023 order 1", o.os77a, true, null);
  await ingest("O.S. 77-2023 order 2", o.os77b, true, c.caseId);
  await ingest("O.S. 77-2023 order 3", o.os77c, true, c.caseId);

  for (const cs of ws.cases) cs.isDemo = true;
  for (const d of ws.documents) d.isDemo = true;
  for (const ord of ws.orders) ord.isDemo = true;

  // A manual overdue task and a completed one.
  createTask(ws, session, { caseId: c1, title: "Collect certified copy of the last order", description: "Demo task.", dueDate: addDays(today, -1), priority: "normal" });
  const done = createTask(ws, session, { caseId: c2, title: "Share objections copy with client", description: "Demo task.", dueDate: addDays(today, -2), priority: "low" });
  updateTask(ws, session, done.id, { status: "done" });

  // Leave one reschedule decision open so the date-change review is visible; resolve none.
  void resolveReschedule;

  // Research report v1 on case 1 (demo pipeline, fictional authorities).
  const caseRec = ws.cases.find((x) => x.id === c1)!;
  const orders = ws.orders.filter((x) => x.caseId === c1);
  const rules = demoIssues({ caseRecord: caseRec, orders, documents: [], question: "Can we ask the court to proceed without the written statement if it is not filed?", actingFor: "petitioner", createdBy: session.userId });
  const seen = new Map<string, RetrievedDoc>();
  for (const q of rules.queries) for (const e of DEMO_CORPUS) if (q.split(" ").some((w) => w.length > 3 && e.keywords.some((k) => k.includes(w)))) seen.set(e.doc.sourceId, e.doc);
  const docs = rules.relevant([...seen.values()]).slice(0, 5);
  const authorities = docs.map((d) => ({
    id: newId("auth"), sourceId: d.sourceId, connector: d.connector, name: d.title, citation: d.citation, court: d.court, decisionDate: d.decisionDate, bench: d.bench, url: d.url,
    fictional: true, verification: "fictional_demo" as const, passages: d.passages, treatment: null,
    issue: "", materialFacts: "", principle: "", relevance: "", distinctions: "", stance: "supports" as const, bindingness: "unknown" as const,
    ...rules.annotate(d),
  }));
  const built = rules.build(authorities);
  saveResearchVersion(ws, session, c1, {
    createdAt: nowISO(), createdBy: session.userId, mode: "demo", pipeline: "demo-rules/demo",
    question: "Can we ask the court to proceed without the written statement if it is not filed?",
    orderIds: orders.map((x) => x.id), documentIds: [], summary: built.summary, issues: rules.issues, provisions: rules.provisions,
    authorities, arguments: built.arguments, counterarguments: built.counterarguments, missingFacts: rules.missingFacts, nextSteps: built.nextSteps,
    limitations: ["Demo report: every judgment is FICTIONAL. Provisions are from a fixed demo table and unverified.", "No subsequent-treatment (good-law) check has been run."],
    sourcesChecked: [{ connector: "demo", queries: rules.queries, resultCount: docs.length, error: null, checkedAt: nowISO() }],
  });

  ws.demoLoaded = true;
  audit(ws, session, "demo.loaded", "office", ws.office.id, null, "Fictional demo workspace loaded");
}

/** Remove only demo records; anything the user created stays. */
export function clearDemo(ws: Workspace, session: Session) {
  requireRole(session, "owner");
  const demoCases = new Set(ws.cases.filter((c) => c.isDemo).map((c) => c.id));
  const demoDocs = new Set(ws.documents.filter((d) => d.isDemo).map((d) => d.id));
  ws.cases = ws.cases.filter((c) => !demoCases.has(c.id));
  ws.clients = ws.clients.filter((c) => !c.isDemo);
  ws.documents = ws.documents.filter((d) => !demoDocs.has(d.id));
  ws.jobs = ws.jobs.filter((j) => !demoDocs.has(j.documentId));
  ws.orders = ws.orders.filter((o) => !demoCases.has(o.caseId));
  ws.hearings = ws.hearings.filter((h) => !demoCases.has(h.caseId));
  ws.dateChanges = ws.dateChanges.filter((d) => !demoCases.has(d.caseId));
  ws.tasks = ws.tasks.filter((t) => !demoCases.has(t.caseId));
  ws.clientUpdates = ws.clientUpdates.filter((u) => !demoCases.has(u.caseId));
  ws.research = ws.research.filter((r) => !demoCases.has(r.caseId));
  for (const c of ws.cases) if (c.clientId && !ws.clients.some((x) => x.id === c.clientId)) c.clientId = null;
  ws.demoLoaded = false;
  audit(ws, session, "demo.cleared", "office", ws.office.id, null, "Demo records removed");
}
