import type { Hearing, ProcessingJob, SourceVerification, Task } from "@/lib/types";
import { dueLabel } from "@/lib/services/queries";
import { Badge } from "./ui";

export function HearingBadge({ status }: { status: Hearing["status"] }) {
  switch (status) {
    case "confirmed": return <Badge tone="ok">Confirmed</Badge>;
    case "awaiting_verification": return <Badge tone="neutral">Awaiting verification</Badge>;
    case "superseded": return <Badge tone="neutral" icon={false}>Superseded</Badge>;
    case "cancelled": return <Badge tone="neutral" icon={false}>Cancelled</Badge>;
    case "held": return <Badge tone="navy" icon={false}>Held</Badge>;
  }
}

export function JobBadge({ status }: { status: ProcessingJob["status"] }) {
  switch (status) {
    case "needs_review": return <Badge tone="warn">Needs review</Badge>;
    case "approved": return <Badge tone="ok">Approved</Badge>;
    case "rejected": return <Badge tone="neutral">Rejected</Badge>;
    case "failed": return <Badge tone="danger">Could not read</Badge>;
  }
}

export function DueBadge({ task, today }: { task: Pick<Task, "dueDate" | "status">; today?: string }) {
  if (task.status === "done") return <Badge tone="ok">Done</Badge>;
  const d = dueLabel(task.dueDate, today);
  return <Badge tone={d.tone === "overdue" ? "danger" : d.tone === "soon" ? "warn" : "neutral"} icon={d.tone !== "normal"}>{d.text}</Badge>;
}

export function VerificationBadge({ v }: { v: SourceVerification }) {
  switch (v) {
    case "fictional_demo": return <Badge tone="demo" title="This record is invented for the demo. It is not real law.">Fictional — demo only</Badge>;
    case "unverified": return <Badge tone="neutral" title="Not checked against an official or retrieved source">Unverified</Badge>;
    case "source_retrieved": return <Badge tone="navy" title="Retrieved from the connected source; not yet reviewed by you">Retrieved, not reviewed</Badge>;
    case "advocate_reviewed": return <Badge tone="ok">Reviewed by you</Badge>;
  }
}
