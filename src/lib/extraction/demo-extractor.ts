import type { Extraction, ExtractedField, ProposedTask } from "../types";
import { parseIndianDate, slugKey } from "../util";

/**
 * Deterministic, rule-based extractor used in demo mode (no AI key).
 * It is NOT AI: it only recognises common English order phrasing, and it never
 * produces a date unless an explicit date is written in the order.
 */

const DATE = String.raw`(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9},?\s+\d{4})`;
const KANNADA_DIGITS = "೦೧೨೩೪೫೬೭೮೯";

function toAsciiDigits(s: string) {
  return s.replace(/[೦-೯]/g, (d) => String(KANNADA_DIGITS.indexOf(d)));
}

const stated = <T,>(value: T, source: string): ExtractedField<T> => ({ value, status: "stated", source: source.trim().slice(0, 300) });
const inferred = <T,>(value: T, source: string | null): ExtractedField<T> => ({ value, status: "inferred", source: source ? source.trim().slice(0, 300) : null });
const missing = <T,>(): ExtractedField<T> => ({ value: null, status: "missing", source: null });

function lines(text: string) {
  return text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
}
function sentences(text: string) {
  return text.replace(/\n+/g, " ").split(/(?<=[.;])\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
}

const STAGES: [RegExp, string][] = [
  [/\b(written statement|W\.?S\.?)\b/i, "Written statement"],
  [/\bobjections?\b/i, "Objections"],
  [/\bframing of issues|\bissues\b/i, "Framing of issues"],
  [/\b(plaintiff'?s?|petitioner'?s?|PW-?\d*)\s+evidence|\bevidence\b/i, "Evidence"],
  [/\bcross[- ]examination\b/i, "Cross-examination"],
  [/\barguments?\b/i, "Arguments"],
  [/\bjudgment\b/i, "Judgment"],
  [/\bappearance\b|\bservice of summons\b|\bsummons\b/i, "Appearance / service"],
  [/\bI\.?A\.?\b|interlocutory application/i, "Interlocutory application"],
];

export function demoExtract(raw: string, hint: { caseNumber?: string; court?: string } = {}): Extraction {
  const text = toAsciiDigits(raw);
  const warnings: string[] = [];
  const ls = lines(text);
  const ss = sentences(text);

  // Case number
  const cnRe = /\b((?:[A-Z][A-Za-z]{0,5}\.?\s?){1,4}(?:\([A-Za-z]+\)\s?)?)(?:No\.?\s*)?(\d{1,6})\s*(?:\/|of)\s*((?:19|20)\d{2})\b/;
  let caseNumber: ExtractedField<string> = missing();
  for (const l of ls) {
    const m = l.match(cnRe);
    if (m && !/^(date|dated)\b/i.test(l)) {
      caseNumber = stated(`${m[1].replace(/\bNo\.?\s*$/i, "").trim()} ${m[2]}/${m[3]}`.replace(/\s+/g, " "), l);
      break;
    }
  }
  if (!caseNumber.value && hint.caseNumber) caseNumber = inferred(hint.caseNumber, "Entered by you before upload");

  const cnrM = text.match(/\b([A-Z]{4}\d{12})\b/);
  const cnr = cnrM ? stated(cnrM[1], cnrM[0]) : missing<string>();

  const titleLine = ls.find((l) => /\s(v\.|vs\.?|versus)\s/i.test(l));
  let title: ExtractedField<string> = missing();
  if (titleLine) {
    const t = titleLine.replace(cnRe, "").replace(/^[\s,:-]+/, "").trim();
    if (t) title = stated(t, titleLine);
  }

  const courtLine = ls.find((l) => /^in the (court|high court)|high court of|court of the/i.test(l));
  let court: ExtractedField<string> = courtLine ? stated(courtLine.replace(/^in the\s+/i, "").replace(/\s+/g, " "), courtLine) : missing();
  if (!court.value && hint.court) court = inferred(hint.court, "Entered by you before upload");

  // Order date: only from an explicit "Date:" / "Dated" / "Order dated" phrase. Never today's date.
  let orderDate: ExtractedField<string> = missing();
  const od = text.match(new RegExp(String.raw`(?:^|\n|\s)(?:date|dated|order dated|order date)\s*[:\-]?\s*${DATE}`, "i"));
  if (od) {
    const v = parseIndianDate(od[1]);
    if (v) orderDate = stated(v, od[0]);
    else warnings.push(`The order date "${od[1]}" is not a real calendar date.`);
  } else warnings.push("No order date is written in the order. It has been left blank.");

  // Next hearing: only an explicit date after a listing phrase.
  let nextHearingDate: ExtractedField<string> = missing();
  const nh = text.match(new RegExp(String.raw`(?:adjourned to|adjourn(?:ed)? the matter to|call on|posted to|post(?:ed)? on|list(?:ed)? on|put up on|next date(?: of hearing)?\s*[:\-]?|N\.?D\.?H\.?\s*[:\-]?)\s*${DATE}`, "i"));
  if (nh) {
    const v = parseIndianDate(nh[1]);
    if (v) nextHearingDate = stated(v, nh[0]);
    else warnings.push(`The next date "${nh[1]}" is not a real calendar date. Check the order.`);
  } else {
    const rel = text.match(/(?:adjourned|posted|call|list(?:ed)?|put up)\s+(?:by|after|for|in)\s+(\w+\s+(?:days?|weeks?|months?))/i);
    if (rel) warnings.push(`The order gives a relative date ("${rel[0]}") but no calendar date. No date was filled in.`);
    else if (/adjourn|call on|posted/i.test(text)) warnings.push("The order seems to adjourn the matter, but no next date could be read.");
  }

  const adjM = text.match(/[^.\n]*\b(adjourn\w*|call on|posted to|put up on)\b[^.\n]*/i);
  const adjourned: ExtractedField<boolean> = adjM ? stated(true, adjM[0]) : inferred(false, null);

  const costM = text.match(/costs?\s+(?:of\s+)?((?:Rs\.?|₹|INR)\s?[\d,]+(?:\/-)?)/i);
  const costs = costM ? stated(costM[1].replace(/\s+/g, " "), costM[0]) : missing<string>();

  // Stage: look near the next-date phrase first, then anywhere.
  let stage: ExtractedField<string> = missing();
  const near = nh ? text.slice(Math.max(0, (nh.index ?? 0) - 40), (nh.index ?? 0) + nh[0].length + 60) : "";
  for (const [re, label] of STAGES) {
    const hit = near.match(re);
    if (hit) { stage = stated(label, near); break; }
  }
  if (!stage.value) for (const [re, label] of STAGES) {
    const s = ss.find((x) => re.test(x));
    if (s) { stage = inferred(label, s); break; }
  }

  // Summarise only the body of the order (after the header lines: court, number, parties, date).
  const dateLineIdx = ls.findIndex((l) => /^(date|dated|order dated)\b/i.test(l));
  const body = dateLineIdx >= 0 ? ls.slice(dateLineIdx + 1).join(" ") : ls.filter((l) => l !== courtLine && l !== titleLine && !cnRe.test(l)).join(" ");
  const bodySentences = sentences(body).filter((s) => /present|absent|granted|sought|filed|heard|adjourn|directed|appear|costs|issued|service|accepts|extended|seeks|time/i.test(s));
  const summary = bodySentences.length ? inferred(bodySentences.slice(0, 3).join(" "), bodySentences[0]) : missing<string>();

  // A party's request ("sought time to file…") is not a court direction.
  const directions = ss.filter((s) => /\b(directed|shall|to file|is to|are to|on or before|is ordered|issue notice|steps|may file)\b/i.test(s) && !/\b(sought|seeks|prayed|requests?|requested|sought for)\b/i.test(s)).slice(0, 8);

  const tasks: ProposedTask[] = [];
  for (const d of directions) {
    const f = d.match(/\b(?:to file|file|filing of)\s+([a-z][a-z /-]{2,60}?)(?=\s+(?:on or before|before|by|within|$)|[.,;])/i);
    if (!f) continue;
    const what = f[1].replace(/\b(the|his|her|their)\b/gi, "").replace(/\s+/g, " ").trim();
    const explicit = d.match(new RegExp(String.raw`(?:on or before|before|by)\s+${DATE}`, "i"));
    const before = /on or before the next date|before the next date|by the next date/i.test(d);
    let dueDate: string | null = null;
    let dueBasis: ProposedTask["dueBasis"] = "none";
    if (explicit) { dueDate = parseIndianDate(explicit[1]); dueBasis = dueDate ? "stated_in_order" : "none"; }
    else if (before && nextHearingDate.value) { dueDate = nextHearingDate.value; dueBasis = "next_hearing"; }
    tasks.push({ key: slugKey("file " + what), title: `Track filing of ${what}`, dueDate, dueBasis, priority: /last (chance|opportunity)/i.test(text) ? "high" : "normal", source: d.slice(0, 300) });
  }
  // One task per key: keep the version that has a date grounded in the order.
  for (let i = tasks.length - 1; i >= 0; i--) {
    const j = tasks.findIndex((t) => t.key === tasks[i].key);
    if (j !== i) { if (!tasks[j].dueDate && tasks[i].dueDate) tasks[j] = tasks[i]; tasks.splice(i, 1); }
  }
  if (costs.value) tasks.push({ key: "costs", title: `Note costs of ${costs.value} ordered (check who pays and when)`, dueDate: null, dueBasis: "none", priority: "normal", source: costs.source });
  tasks.push({ key: "update client", title: "Send the client an update", dueDate: null, dueBasis: "none", priority: "normal", source: null });

  if (/last (chance|opportunity)/i.test(text)) warnings.push("The order says this is a last chance. Treat the related deadline as high priority.");
  const okFields = [caseNumber, orderDate, nextHearingDate].filter((f) => f.status === "stated").length;

  return {
    caseNumber, cnr, title, court, orderDate, nextHearingDate, stage, summary, adjourned, costs,
    directions, tasks, clientUpdateEn: "", clientUpdateKn: "",
    confidence: okFields === 3 ? "high" : okFields === 2 ? "medium" : "low",
    warnings, extractor: "demo-rules", model: null,
  };
}
