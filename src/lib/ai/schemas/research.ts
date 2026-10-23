// JSON Schemas sent to the model for research (structured output). They mirror the Zod schemas that re-check every
// answer (aiIssueSchema / aiSynthesisSchema in src/lib/schemas.ts). Kept simple: limits are enforced by Zod.

const str = { type: "string" };
const strArr = { type: "array", items: str };
const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });

export const RESEARCH_ANALYSE_JSON_SCHEMA = obj({
  summary: str,
  issues: { type: "array", items: obj({ title: str, whatOrderDecided: str, questionsNext: strArr, establishedFacts: strArr, inferences: strArr, unknownFacts: strArr }) },
  searchQueries: strArr,
  provisions: { type: "array", items: obj({ legislation: str, section: str, explanation: str, relevance: str, factsRequired: strArr, considerations: str }) },
});

export const RESEARCH_SYNTHESISE_JSON_SCHEMA = obj({
  summary: str,
  authorities: {
    type: "array",
    items: obj({
      sourceId: str, issue: str, materialFacts: str, principle: str, passageIds: strArr, relevance: str, distinctions: str,
      stance: { type: "string", enum: ["supports", "limits", "contradicts"] },
      bindingness: { type: "string", enum: ["binding", "persuasive", "unknown"] },
    }),
  },
  arguments: { type: "array", items: obj({ proposition: str, facts: strArr, supportIds: strArr, evidenceNeeded: strArr, counterpoints: strArr, limitations: str, verify: str }) },
  counterarguments: { type: "array", items: obj({ point: str, authorityIds: strArr, risk: str }) },
  missingFacts: strArr,
  nextSteps: { type: "array", items: obj({ text: str, kind: { type: "string", enum: ["read", "verify", "investigate", "evidence", "procedure"] } }) },
});
