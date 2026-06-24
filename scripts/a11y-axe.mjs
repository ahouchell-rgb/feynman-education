// Accessibility audit — runs axe-core (WCAG 2.0/2.1/2.2 A & AA) against the
// public, no-auth routes via a headless browser. Used by the CI `a11y` job
// (non-blocking for now). Prints a per-route violation report and exits non-zero
// if anything is found, so the job surfaces the issues without yet blocking.
//
// Local run:  npm run build && (npm run start &) && node scripts/a11y-axe.mjs
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.env.A11Y_BASE_URL || "http://localhost:3000";
// Public surfaces a procurement officer / signed-out visitor can reach.
const ROUTES = ["/", "/login", "/privacy", "/trust-centre"];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const browser = await chromium.launch();
// @axe-core/playwright requires a page from an explicit BrowserContext, not
// browser.newPage() (which raises "Please use browser.newContext()").
const context = await browser.newContext();
const page = await context.newPage();
let total = 0;

for (const route of ROUTES) {
  const url = BASE + route;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  } catch (e) {
    console.error(`✗ ${route}: could not load (${e.message})`);
    total++;
    continue;
  }
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  if (!violations.length) {
    console.log(`✓ ${route}: no WCAG A/AA violations`);
    continue;
  }
  console.log(`\n✗ ${route}: ${violations.length} rule(s) with violations`);
  for (const v of violations) {
    total += v.nodes.length;
    console.log(`  • [${v.impact}] ${v.id} — ${v.help}`);
    console.log(`    ${v.helpUrl}`);
    for (const n of v.nodes.slice(0, 5)) console.log(`      ${n.target.join(" ")}`);
  }
}

await browser.close();
console.log(`\n${total ? "✗" : "✓"} a11y: ${total} issue(s) across ${ROUTES.length} routes`);
process.exit(total ? 1 : 0);
