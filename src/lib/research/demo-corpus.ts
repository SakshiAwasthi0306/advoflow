import type { RetrievedDoc } from "./connectors";

// ⚠️ EVERY RECORD BELOW IS FICTIONAL. These cases, citations and passages do not exist.
// They only demonstrate how AdvoFlow displays retrieved authorities. Never cite them.

const d = (
  id: string, title: string, court: string, date: string, keywords: string[], passages: [string, string][],
): { doc: RetrievedDoc; keywords: string[] } => ({
  keywords,
  doc: {
    sourceId: id,
    connector: "demo",
    title: `${title} (FICTIONAL DEMO)`,
    citation: `DEMO-${id.toUpperCase()}`,
    court: `${court} — fictional demo record`,
    decisionDate: date,
    bench: null,
    url: null,
    passages: passages.map(([locator, text], i) => ({ id: `p${i + 1}`, text, locator: `${locator} (demo)` })),
    fictional: true,
  },
});

export const DEMO_CORPUS = [
  d("demo-ws-1", "Meenakshi Traders v. Harish Kulkarni", "Supreme Court of India", "2019-03-11",
    ["written statement", "statement", "delay", "time limit", "directory", "costs", "adjournment", "defendant"],
    [["para 9", "The time fixed for filing a written statement is a rule of procedure meant to speed up the trial; ordinarily it should be followed, and an extension should be the exception, granted for reasons recorded in writing."],
     ["para 12", "Where the delay is explained and the opposite party can be compensated by costs, refusing the written statement altogether may cause greater injustice than the delay itself."]]),
  d("demo-ws-2", "Sunrise Infra Pvt Ltd v. Coastal Builders", "Supreme Court of India", "2020-07-02",
    ["commercial", "written statement", "statement", "120 days", "mandatory", "forfeit", "delay"],
    [["para 18", "In a suit governed by the commercial courts law, the outer limit for the written statement is strict; once it expires, the defendant loses the right to file it, and the court cannot extend it by invoking inherent powers."]]),
  d("demo-ws-3", "Lakshmamma v. Rangaswamy", "High Court of Karnataka", "2021-01-15",
    ["written statement", "statement", "last chance", "costs", "closed", "right", "defendant", "absent"],
    [["para 7", "When the court has granted a 'last chance' subject to costs and the defendant again fails to file, the trial court may proceed with the suit without the written statement, though it must still examine the plaintiff's case on merits."]]),
  d("demo-adj-1", "Gowda & Sons v. Municipal Council, Hassan", "High Court of Karnataka", "2018-09-20",
    ["adjournment", "adjourned", "repeated", "costs", "delay", "evidence"],
    [["para 5", "Repeated adjournments sought by the same party without real cause defeat the purpose of the procedure; courts should impose realistic costs and record why a further adjournment is granted."]]),
  d("demo-inj-1", "Farida Begum v. Shivakumar", "High Court of Karnataka", "2022-04-04",
    ["injunction", "interim", "temporary", "prima facie", "balance of convenience", "irreparable"],
    [["para 11", "An interim injunction requires a prima facie case, a balance of convenience in the applicant's favour and a showing that refusal would cause injury not compensable in money."]]),
  d("demo-cond-1", "Ramprasad v. State Transport Corporation", "Supreme Court of India", "2017-11-28",
    ["condone", "condonation", "delay", "sufficient cause", "limitation"],
    [["para 6", "'Sufficient cause' is construed liberally where no negligence or lack of good faith is shown, but a party that has been plainly careless cannot claim it as of right."]]),
  d("demo-ev-1", "Nagaraj v. Devika Rani", "High Court of Karnataka", "2023-02-17",
    ["evidence", "plaintiff", "closed", "affidavit", "chief examination", "witness"],
    [["para 8", "Before closing a party's evidence for non-appearance, the court should consider whether earlier adjournments were at that party's instance and whether a short final opportunity would meet the ends of justice."]]),
];
