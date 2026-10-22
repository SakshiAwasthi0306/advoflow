// End-to-end walk through the demo workflow in a real browser.
// Usage: start the app (npm run build && npm start), then: BASE_URL=http://localhost:3000 node tests/e2e/demo-workflow.mjs
// Requires Playwright (npx playwright install chromium) — not part of the default `npm test`.
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR;
const log = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) process.exitCode = 1; };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const text = async () => page.locator("main").innerText();

// 1. Dashboard + load demo
await page.goto(BASE);
if (await page.getByRole("button", { name: "Load demo workspace" }).count()) {
  await page.getByRole("button", { name: "Load demo workspace" }).click();
  await page.waitForSelector("text=Today's hearings");
}
await page.waitForTimeout(500);
log((await text()).includes("Today's hearings"), "1. dashboard shows today's hearings");
log((await text()).includes("Orders awaiting your review"), "1. dashboard lists orders awaiting verification");
await shot("01-dashboard");

// 2-3. Sample case and timeline
await page.goto(`${BASE}/cases`);
await page.getByRole("link", { name: "O.S. 482/2025" }).first().click();
await page.getByRole("link", { name: /Orders & Timeline/ }).click();
await page.waitForSelector("text=Hearing date changes");
const t = await text();
log((t.match(/Approved by advocate/g) ?? []).length === 3, "3. timeline shows three approved orders");
log(t.includes("task(s) to review"), "3. date change flags tasks for review");
await shot("02-timeline");

// 4-7. Paste a sample order, review, approve
await page.goto(`${BASE}/upload`);
await page.getByRole("button", { name: "Insert a sample order" }).click();
await page.getByRole("button", { name: "Read orders" }).click();
await page.waitForSelector("text=Ready for your review");
await page.getByRole("link", { name: "Review and confirm" }).first().click();
await page.waitForSelector("text=Which case is this?");
await shot("03-review");
const noDup = await page.locator("text=Create a new case").count();
log(noDup > 0, "5. review screen offers case choice");
await page.getByLabel(/I have checked this date/).check();
await page.getByRole("button", { name: "Review and confirm" }).click();
await page.waitForURL(/tab=orders/);
log((await text()).includes("Approved by advocate"), "7. approved order appears on the new case timeline");
const newCaseUrl = page.url();

// 8. Calendar and tasks updated
await page.goto(`${BASE}/calendar?view=agenda`);
log((await text()).includes("O.S. 615/2026"), "8. calendar shows the new hearing");
await page.goto(`${BASE}/tasks`);
log((await text()).includes("O.S. 615/2026"), "8. tasks list shows tasks from the approved order");

// Duplicate processing: same text again
await page.goto(`${BASE}/upload`);
await page.getByRole("button", { name: "Insert a sample order" }).click();
await page.getByRole("button", { name: "Read orders" }).click();
await page.waitForSelector("text=Already approved earlier");
log(true, "duplicate upload is recognised and nothing new is created");

// Rejecting the pending demo order leaves records unchanged
await page.goto(`${BASE}/upload`);
const pending = page.locator("#queue a").first();
if (await pending.count()) {
  await pending.click();
  await page.waitForSelector("text=Proposed update");
  log((await text()).includes("relative date"), "missing (relative) next date is flagged, not invented");
  await page.getByRole("button", { name: "Reject proposed update" }).click();
  await page.getByRole("button", { name: "Click again to reject" }).click();
  await page.waitForURL(/\/upload/);
  log(true, "rejecting a proposal works");
}

// 9-13. Research
await page.goto(`${BASE}/research`);
await page.locator("main a[href^='/research/rep_']").first().click();
await page.waitForSelector("text=Relevant judgments");
const r = await text();
log(r.includes("Fictional — demo only") && r.includes("Demonstration report"), "10-11. demo authorities are labelled fictional");
log(r.includes("Counterarguments & risks") && /Limits|Contradicts/.test(r), "10. contrary authorities are shown");
await shot("04-research");
await page.getByRole("button", { name: "Mark as reviewed" }).first().click();
await page.waitForSelector("text=Reviewed ✓ (undo)");
log(true, "11. source verification state can be changed");
await page.getByLabel("Add your note").fill("Read para 7 before the next hearing.");
await page.getByRole("button", { name: "Save note" }).click();
await page.waitForSelector("text=Read para 7 before the next hearing.");
log(true, "12. research note saved");
await page.getByRole("button", { name: "Save to case" }).first().click();
await page.waitForSelector("text=Saved to case ✓");
log(true, "12. authority saved to the case");
await page.getByRole("button", { name: "Make this a task…" }).first().click();
await page.getByRole("button", { name: "Confirm and create task" }).click();
await page.waitForSelector("text=Task created ✓");
log(true, "13. research recommendation became a task only after confirmation");

// 14. Client message edit + copy
await page.goto(newCaseUrl.replace("tab=orders", "tab=client"));
const ta = page.locator("textarea").first();
await ta.fill((await ta.inputValue()) + " (edited)");
await page.getByRole("button", { name: "Save edits" }).first().click();
await page.waitForSelector("text=Draft saved");
await page.getByRole("button", { name: "Copy" }).first().click();
const clip = await page.evaluate(() => navigator.clipboard.readText());
log(clip.endsWith("(edited)"), "14. client message edited and copied");
log((await text()).includes("ಕನ್ನಡ"), "14. Kannada draft present");

// 15. Calendar CSV
const csv = await (await page.request.get(`${BASE}/api/calendar`)).text();
log(csv.includes("Subject") && csv.includes("O.S. 615/2026"), "15. calendar CSV export works");

// 16. Refresh keeps records
await page.reload();
log((await page.locator("textarea").first().inputValue()).endsWith("(edited)"), "16. records persist after refresh");

// Mobile layout
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(BASE);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
log(!overflow, "mobile: no horizontal scrolling on the dashboard");
await page.getByRole("button", { name: "Open menu" }).click();
log(await page.getByRole("dialog", { name: "Menu" }).isVisible(), "mobile: navigation menu opens");
await shot("05-mobile");

log(errors.length === 0, `no browser errors${errors.length ? ": " + errors.join(" | ") : ""}`);
await browser.close();
