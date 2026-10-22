// Core domain types for AdvoFlow.
// Everything an office owns lives in one Workspace aggregate, loaded and saved as a unit
// so related changes (an order + its hearing + its tasks) commit together.

export type ISODate = string; // "YYYY-MM-DD"
export type ISODateTime = string; // full ISO timestamp

export type Role = "owner" | "advocate" | "clerk" | "viewer";

export interface Office {
  id: string;
  name: string;
  createdAt: ISODateTime;
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
}

export interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  preferredLanguage: "en" | "kn";
  preferredChannel: "whatsapp" | "phone" | "email";
  notes: string;
  isDemo: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type CaseStatus = "active" | "closed" | "archived";

export interface CaseRecord {
  id: string;
  number: string; // as written, e.g. "O.S. 482/2025"
  numberKey: string | null; // normalised "OS|482|2025" for matching
  cnr: string | null;
  title: string;
  parties: { petitioner: string; respondent: string };
  court: string;
  caseType: string;
  stage: string;
  clientId: string | null;
  status: CaseStatus;
  isDemo: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface DocumentRecord {
  id: string;
  caseId: string | null;
  filename: string;
  mime: string;
  size: number;
  sha256: string;
  storageKey: string; // path inside private storage; never served directly
  kind: "order" | "cause_list" | "other";
  textExtract: string | null; // extracted text (kept so the original wording stays reviewable)
  textSource: "pdf_text" | "ocr" | "pasted" | "plain_text" | "none";
  isDemo: boolean;
  uploadedBy: string;
  createdAt: ISODateTime;
}

// ---- Extraction ---------------------------------------------------------

export type FieldStatus = "stated" | "inferred" | "missing";

export interface ExtractedField<T> {
  value: T | null;
  status: FieldStatus; // stated in the order, inferred by the extractor, or not present
  source: string | null; // passage from the order that supports the value
}

export interface ProposedTask {
  key: string;
  title: string;
  dueDate: ISODate | null;
  dueBasis: "stated_in_order" | "next_hearing" | "none";
  priority: "high" | "normal";
  source: string | null;
}

export interface Extraction {
  caseNumber: ExtractedField<string>;
  cnr: ExtractedField<string>;
  title: ExtractedField<string>;
  court: ExtractedField<string>;
  orderDate: ExtractedField<ISODate>;
  nextHearingDate: ExtractedField<ISODate>;
  stage: ExtractedField<string>;
  summary: ExtractedField<string>;
  adjourned: ExtractedField<boolean>;
  costs: ExtractedField<string>;
  directions: string[]; // court directions as stated
  tasks: ProposedTask[]; // suggestions only
  clientUpdateEn: string;
  clientUpdateKn: string;
  confidence: "high" | "medium" | "low";
  warnings: string[];
  extractor: "demo-rules" | "anthropic";
  model: string | null;
}

export interface CaseMatch {
  kind: "exact" | "ambiguous" | "none";
  caseId: string | null;
  candidates: { caseId: string; number: string; title: string; reason: string }[];
}

export type JobStatus = "needs_review" | "approved" | "rejected" | "failed";

export interface ProcessingJob {
  id: string;
  documentId: string;
  idempotencyKey: string; // sha256 of the normalised source text or file
  hint: { caseNumber: string; court: string; context: string };
  status: JobStatus;
  error: string | null;
  extraction: Extraction | null;
  match: CaseMatch | null;
  conflicts: string[];
  createdBy: string;
  createdAt: ISODateTime;
  decidedAt: ISODateTime | null;
  decidedBy: string | null;
  resultOrderId: string | null;
}

// ---- Approved records ---------------------------------------------------

export interface CourtOrder {
  id: string;
  caseId: string;
  documentId: string;
  jobId: string | null;
  orderDate: ISODate | null;
  summary: string;
  stage: string;
  adjourned: boolean;
  costs: string | null;
  directions: string[];
  nextHearingDate: ISODate | null; // as approved by the advocate
  nextHearingConfirmed: boolean;
  approvedFields: string[];
  extractionSnapshot: Extraction | null; // what the AI proposed, kept for audit
  approvedBy: string;
  approvedAt: ISODateTime;
  isDemo: boolean;
}

export type HearingStatus = "awaiting_verification" | "confirmed" | "superseded" | "cancelled" | "held";

export interface Hearing {
  id: string;
  caseId: string;
  date: ISODate;
  purpose: string;
  status: HearingStatus;
  sourceOrderId: string | null;
  supersededById: string | null;
  confirmedBy: string | null;
  confirmedAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface DateChange {
  id: string;
  caseId: string;
  from: ISODate;
  to: ISODate;
  orderId: string | null;
  at: ISODateTime;
  affectedTaskIds: string[];
  reviewed: boolean;
}

export type TaskStatus = "open" | "done";

export interface Task {
  id: string;
  caseId: string;
  title: string;
  description: string;
  dueDate: ISODate | null;
  priority: "high" | "normal" | "low";
  status: TaskStatus;
  source: "manual" | "order" | "research";
  sourceOrderId: string | null;
  sourceReportId: string | null;
  dedupeKey: string | null;
  assigneeId: string | null;
  needsReschedule: { from: ISODate; to: ISODate } | null;
  createdBy: string;
  createdAt: ISODateTime;
  completedAt: ISODateTime | null;
}

export interface ClientUpdate {
  id: string;
  caseId: string;
  clientId: string | null;
  lang: "en" | "kn";
  text: string;
  status: "draft" | "approved" | "handed_off";
  sourceOrderId: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  handedOffAt: ISODateTime | null; // WhatsApp opened; NOT proof of delivery
}

// ---- Legal research -----------------------------------------------------

export type SourceVerification = "fictional_demo" | "unverified" | "source_retrieved" | "advocate_reviewed";

export interface SourcePassage {
  id: string;
  text: string;
  locator: string | null; // paragraph or page reference, only if the source provides one
}

export interface Authority {
  id: string;
  sourceId: string; // connector's id for the document
  connector: string;
  name: string;
  citation: string | null;
  court: string;
  decisionDate: ISODate | null;
  bench: string | null;
  issue: string;
  materialFacts: string;
  principle: string;
  passages: SourcePassage[];
  relevance: string;
  distinctions: string;
  stance: "supports" | "limits" | "contradicts";
  bindingness: "binding" | "persuasive" | "unknown";
  treatment: string | null;
  url: string | null;
  verification: SourceVerification;
  fictional: boolean;
}

export interface Provision {
  id: string;
  legislation: string;
  section: string;
  explanation: string;
  relevance: string;
  factsRequired: string[];
  considerations: string;
  url: string | null;
  verification: SourceVerification;
  origin: "connector" | "ai_suggested" | "demo";
}

export interface LegalIssue {
  id: string;
  title: string;
  whatOrderDecided: string;
  questionsNext: string[];
  establishedFacts: string[]; // stated in approved orders
  inferences: string[]; // AI or rule inferences, labelled as such
  unknownFacts: string[];
}

export interface Argument {
  id: string;
  proposition: string;
  facts: string[];
  supportIds: string[]; // authority or provision ids
  evidenceNeeded: string[];
  counterpoints: string[];
  limitations: string;
  verify: string;
}

export interface Counterargument {
  id: string;
  point: string;
  authorityIds: string[];
  risk: string;
}

export interface NextStep {
  id: string;
  text: string;
  kind: "read" | "verify" | "investigate" | "evidence" | "procedure";
  taskId: string | null; // set once the advocate confirms it as a task
}

export interface ResearchNote {
  id: string;
  text: string;
  author: "advocate" | "ai";
  authorId: string | null;
  createdAt: ISODateTime;
}

export interface ResearchVersion {
  version: number;
  createdAt: ISODateTime;
  createdBy: string;
  mode: "demo" | "live" | "partial";
  pipeline: string; // e.g. "demo-rules/demo-corpus" or "anthropic:<model>/indiankanoon"
  question: string;
  orderIds: string[];
  documentIds: string[];
  status: "needs_review" | "reviewed";
  summary: string;
  issues: LegalIssue[];
  provisions: Provision[];
  authorities: Authority[];
  arguments: Argument[];
  counterarguments: Counterargument[];
  missingFacts: string[];
  nextSteps: NextStep[];
  limitations: string[];
  sourcesChecked: { connector: string; queries: string[]; resultCount: number; error: string | null; checkedAt: ISODateTime }[];
  notes: ResearchNote[];
  reviewedAuthorityIds: string[];
  savedAuthorityIds: string[];
  bookmarkedProvisionIds: string[];
}

export interface ResearchReport {
  id: string;
  caseId: string;
  title: string;
  createdAt: ISODateTime;
  versions: ResearchVersion[];
}

export interface AuditEntry {
  id: string;
  at: ISODateTime;
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  caseId: string | null;
  detail: string;
}

export interface Workspace {
  office: Office;
  version: number; // optimistic concurrency
  members: Member[];
  clients: Client[];
  cases: CaseRecord[];
  documents: DocumentRecord[];
  jobs: ProcessingJob[];
  orders: CourtOrder[];
  hearings: Hearing[];
  dateChanges: DateChange[];
  tasks: Task[];
  clientUpdates: ClientUpdate[];
  research: ResearchReport[];
  audit: AuditEntry[];
  demoLoaded: boolean;
}

export interface Session {
  userId: string;
  officeId: string;
  role: Role;
  name: string;
  mode: "demo" | "password";
}
