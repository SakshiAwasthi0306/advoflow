import type { AuditEntry } from "./types";

/** Activity in plain words. */
const ACTIONS: Record<string, string> = {
  "order.approved": "Order confirmed into the diary", "order.uploaded": "Order received for review", "order.rejected": "Order draft set aside",
  "case.created": "Case opened", "case.updated": "Case details updated", "case.closed": "Case closed", "case.archived": "Case archived", "case.client_linked": "Client linked",
  "hearing.added": "Hearing added", "hearing.confirmed": "Hearing date confirmed", "hearing.corrected": "Hearing date corrected", "hearing.date_changed": "Hearing moved", "hearing.cancelled": "Hearing cancelled",
  "task.created": "Task added", "task.done": "Task completed", "task.rescheduled": "Task moved to the new date", "task.kept_date": "Task kept on its date",
  "client.created": "Client added", "client.updated": "Client details updated",
  "client_update.edited": "Client update edited", "client_update.handed_off": "Client update opened in WhatsApp", "client_update.ai_drafted": "Client update drafted by AI", "client_update.ai_redrafted": "Client update redrafted by AI",
  "research.run": "Research run", "diary.imported": "Case Diary imported", "demo.loaded": "Demo workspace loaded", "demo.cleared": "Demo workspace removed",
};
export const actionText = (a: AuditEntry) => ACTIONS[a.action] ?? capFirst(a.action.replace(/[._]/g, " "));

function capFirst(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
