import type { Argument, Authority, Counterargument, LegalIssue, NextStep, Provision } from "../types";
import { newId } from "../util";
import type { RetrievedDoc } from "./connectors";
import type { ResearchInput } from "./pipeline";

// Fixed demo rules for issue spotting when no AI is configured.
// Provisions are real CPC / Limitation Act references described in plain language, but they are
// listed from this table and marked UNVERIFIED: check the official text before relying on them.

interface Template {
  test: RegExp;
  issue: Omit<LegalIssue, "id" | "establishedFacts">;
  queries: string[];
  provisions: Omit<Provision, "id" | "verification" | "origin" | "url">[];
  stance: (actingFor: ResearchInput["actingFor"], docId: string) => Authority["stance"];
  steps: Omit<NextStep, "id" | "taskId">[];
  sources: string[]; // demo-corpus id prefixes that actually address this issue
}

const plaintiffSide = (a: ResearchInput["actingFor"]) => a !== "respondent";

const TEMPLATES: Template[] = [
  {
    test: /written statement|\bW\.?S\.?\b/i,
    issue: {
      title: "Delay in filing the written statement",
      whatOrderDecided: "The court gave the defendant further time to file the written statement. It did not decide the merits of the suit.",
      questionsNext: ["If the statement is still not filed, can the court proceed without it?", "Is this a commercial suit, where the time limit is strict?", "Has the costs condition been complied with?"],
      inferences: ["A 'last chance' order suggests the court may refuse further time at the next hearing (inference, not a direction)."],
      unknownFacts: ["Date summons was served on the defendant", "Whether the suit is a commercial suit", "Whether the costs ordered have been paid"],
    },
    queries: ["written statement delay costs last chance", "commercial suit written statement 120 days mandatory"],
    provisions: [
      { legislation: "Code of Civil Procedure, 1908", section: "Order VIII Rule 1", explanation: "Sets the time for the defendant to file a written statement (30 days from service, extendable in limited circumstances).", relevance: "The order turns on the defendant's delay in filing.", factsRequired: ["Date of service of summons", "Earlier extensions granted"], considerations: "Different, stricter rules apply to commercial suits." },
      { legislation: "Code of Civil Procedure, 1908", section: "Order VIII Rule 10", explanation: "Lets the court pronounce judgment or pass another order when a party fails to file a required written statement.", relevance: "Relevant if the defendant does not file by the next date.", factsRequired: ["Whether the statement is filed by the next date"], considerations: "Courts usually still examine the plaintiff's case before deciding." },
    ],
    stance: (a, id) => (id === "demo-ws-1" ? (plaintiffSide(a) ? "limits" : "supports") : id.startsWith("demo-ws") ? (plaintiffSide(a) ? "supports" : "contradicts") : "limits"),
    steps: [
      { text: "Confirm from the record the date summons was served, to count the time already taken.", kind: "investigate" },
      { text: "Check whether the suit is a commercial suit; the time limit works differently there.", kind: "verify" },
      { text: "Check whether the costs ordered have been paid before the next date.", kind: "evidence" },
    ],
    sources: ["demo-ws"],
  },
  {
    test: /injunction|interim|temporary/i,
    issue: {
      title: "Interim injunction",
      whatOrderDecided: "The order concerns an interim application. It does not decide the suit.",
      questionsNext: ["Is there a prima facie case?", "Where does the balance of convenience lie?", "Would refusal cause harm that money cannot repair?"],
      inferences: [], unknownFacts: ["Current possession of the property", "Any undertaking given to the court"],
    },
    queries: ["interim injunction prima facie balance of convenience"],
    provisions: [{ legislation: "Code of Civil Procedure, 1908", section: "Order XXXIX Rules 1 and 2", explanation: "Allows temporary injunctions to prevent harm while the suit is pending.", relevance: "Governs interim applications for injunctions.", factsRequired: ["Nature of threatened harm"], considerations: "Discretionary relief; conduct of parties matters." }],
    stance: () => "supports",
    steps: [{ text: "Collect documents showing possession and the threatened harm.", kind: "evidence" }],
    sources: ["demo-inj"],
  },
  {
    test: /condon|delay|limitation/i,
    issue: {
      title: "Condonation of delay",
      whatOrderDecided: "The order refers to delay. Whether it has been condoned is not stated.",
      questionsNext: ["Is there 'sufficient cause' for the delay?"], inferences: [], unknownFacts: ["Exact length of the delay", "Reasons for the delay"],
    },
    queries: ["condonation of delay sufficient cause"],
    provisions: [{ legislation: "Limitation Act, 1963", section: "Section 5", explanation: "Allows some appeals and applications to be admitted after the time limit if there was sufficient cause.", relevance: "Relevant if a filing is out of time.", factsRequired: ["Length of and reasons for the delay"], considerations: "Does not apply to suits themselves." }],
    stance: () => "supports",
    steps: [{ text: "Work out the exact delay and gather proof of the reasons.", kind: "evidence" }],
    sources: ["demo-cond"],
  },
  {
    test: /evidence|cross|witness|affidavit/i,
    issue: {
      title: "Stage of evidence",
      whatOrderDecided: "The matter is at the evidence stage.",
      questionsNext: ["Can evidence be closed if a party does not appear?", "How many adjournments has each side taken?"], inferences: [], unknownFacts: ["Number of adjournments taken by each side"],
    },
    queries: ["evidence closed adjournment final opportunity", "repeated adjournments costs"],
    provisions: [{ legislation: "Code of Civil Procedure, 1908", section: "Order XVII", explanation: "Deals with adjournments, including limits on how often they are granted and costs.", relevance: "Relevant when a party seeks further time.", factsRequired: ["Adjournment history"], considerations: "Check the current text and any state amendments." }],
    stance: () => "supports",
    steps: [{ text: "List the adjournments each side has taken from the order sheet.", kind: "investigate" }],
    sources: ["demo-ev", "demo-adj"],
  },
];

const FALLBACK: Template = {
  test: /.*/,
  issue: { title: "Next procedural step", whatOrderDecided: "The order is procedural. Its effect on the next step needs reading.", questionsNext: ["What must happen before the next date?"], inferences: [], unknownFacts: ["Full order sheet history"] },
  queries: ["adjournment costs"],
  provisions: [],
  stance: () => "limits",
  steps: [{ text: "Read the full order sheet to confirm what is pending.", kind: "read" }],
  sources: ["demo-adj"],
};

export function demoIssues(input: ResearchInput) {
  const latest = [...input.orders].sort((a, b) => (b.orderDate ?? "").localeCompare(a.orderDate ?? ""))[0];
  const hay = [input.question, latest?.stage, latest?.summary, ...(latest?.directions ?? []), input.caseRecord.stage].join(" ");
  const matched = TEMPLATES.filter((t) => t.test.test(hay));
  const templates = matched.length ? matched.slice(0, 2) : [FALLBACK];
  const facts = latest
    ? [
        latest.orderDate ? `Order dated ${latest.orderDate}.` : "Order date not recorded.",
        latest.summary,
        latest.adjourned ? `Adjourned${latest.nextHearingDate ? ` to ${latest.nextHearingDate}` : ""}.` : "",
        latest.costs ? `Costs ordered: ${latest.costs}.` : "",
        ...latest.directions,
      ].filter(Boolean)
    : [];
  const issues: LegalIssue[] = templates.map((t) => ({ id: newId("iss"), ...t.issue, establishedFacts: facts }));
  const provisions: Provision[] = templates.flatMap((t) => t.provisions.map((p) => ({ id: newId("prov"), ...p, url: null, verification: "unverified" as const, origin: "demo" as const })));
  const queries = templates.flatMap((t) => t.queries);

  return {
    issues,
    provisions,
    queries,
    missingFacts: templates.flatMap((t) => t.issue.unknownFacts),
    /** Keep only retrieved records that address one of the identified issues (keyword hits alone are not enough). */
    relevant(docs: RetrievedDoc[]) {
      return docs.filter((d) => !d.fictional || templates.some((t) => t.sources.some((p) => d.sourceId.startsWith(p))));
    },
    annotate(doc: RetrievedDoc): Partial<Authority> {
      const bindingness: Authority["bindingness"] = /Supreme Court/.test(doc.court) ? "binding" : /Karnataka/.test(doc.court) ? "binding" : "persuasive";
      if (!doc.fictional) {
        // A real judgment found by keyword search. Without AI we cannot say what it decides, so we say so.
        const issue = issues[0];
        return {
          issue: issue?.title ?? "",
          materialFacts: "",
          principle: "",
          relevance: `Found by keyword search for this issue${doc.matchedTerms?.length ? ` (matched: ${doc.matchedTerms.join(", ")})` : ""}. Not analysed: read the passage and the judgment to decide whether it is relevant at all.`,
          distinctions: "Not assessed. Compare the facts and the question decided with your case.",
          stance: "unclassified",
          bindingness,
        };
      }
      const idx = Math.max(0, templates.findIndex((x) => x.sources.some((p) => doc.sourceId.startsWith(p))));
      const t = templates[idx];
      const stance = t.stance(input.actingFor, doc.sourceId);
      return {
        issue: issues[idx].title,
        materialFacts: "Fictional demo facts: see the passage.",
        principle: doc.passages[0]?.text ?? "",
        relevance: `Discusses ${issues[idx].title.toLowerCase()}, an issue raised by the latest order.`,
        distinctions: doc.sourceId === "demo-ws-2" ? "Applies only if this is a commercial suit — not yet established." : "Facts of this (fictional) case may differ; compare before relying on it.",
        stance,
        bindingness,
      };
    },
    build(authorities: Authority[]) {
      // Arguments and counterarguments are only assembled from authorities whose stance is known (the fictional demo set).
      const sup = authorities.filter((a) => a.stance === "supports");
      const against = authorities.filter((a) => a.stance === "limits" || a.stance === "contradicts");
      const real = authorities.filter((a) => !a.fictional);
      const args: Argument[] = sup.slice(0, 2).map((a) => ({
        id: newId("arg"),
        proposition: `Based on ${a.name}: ${a.principle}`,
        facts: facts.slice(0, 3),
        supportIds: [a.id, ...provisions.slice(0, 1).map((p) => p.id)],
        evidenceNeeded: templates[0].issue.unknownFacts,
        counterpoints: against.slice(0, 2).map((x) => x.principle),
        limitations: "Demo argument assembled from fixed rules and a fictional authority.",
        verify: "Replace the fictional authority with a real, verified judgment before use.",
      }));
      const counters: Counterargument[] = against.map((a) => ({ id: newId("ctr"), point: a.principle, authorityIds: [a.id], risk: a.distinctions }));
      const steps: NextStep[] = [
        ...templates.flatMap((t) => t.steps).map((s) => ({ id: newId("step"), ...s, taskId: null })),
        ...authorities.slice(0, 2).map((a) => ({ id: newId("step"), text: a.fictional ? `Read ${a.passages[0]?.locator ?? "the key passage"} of ${a.name} and compare its facts.` : `Read ${a.name}${a.citation ? ` (${a.citation})` : ""} and decide whether it addresses this issue at all.`, kind: "read" as const, taskId: null })),
        { id: newId("step"), text: "Check whether each authority is still good law before citing it.", kind: "verify" as const, taskId: null },
      ];
      const found = real.length
        ? `${real.length} real judgment${real.length === 1 ? " was" : "s were"} found by keyword search in the eCourts open data. They have not been analysed: read each one before relying on it.`
        : `${authorities.length} demo authorit${authorities.length === 1 ? "y was" : "ies were"} retrieved (${sup.length} supporting, ${against.length} limiting or contrary). All demo judgments are fictional.`;
      const summary = latest
        ? `The latest approved order${latest.orderDate ? ` (${latest.orderDate})` : ""} raises: ${issues.map((i) => i.title.toLowerCase()).join("; ")}. ${found}`
        : `No approved order was selected. Issues are based on the case record only. ${real.length ? found : ""}`.trim();
      return { summary, arguments: args, counterarguments: counters, nextSteps: steps };
    },
  };
}
