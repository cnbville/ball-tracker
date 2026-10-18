// Drives the frontend in Chromium with ESPN-shaped fixtures and a fixed clock, and saves screenshots.
// Run: npm run test:ui  (needs playwright; for a global install set PLAYWRIGHT=$(npm root -g)/playwright)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const fx = (n) => fs.readFileSync(path.join(root, "tests/fixtures", n), "utf8");
const types = { html: "text/html", css: "text/css", js: "text/javascript", png: "image/png", svg: "image/svg+xml", woff2: "font/woff2" };
const NOW = process.env.NOW || "2026-10-24T20:10:00Z";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, timezoneId: "Europe/Berlin" });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
await page.clock.install({ time: new Date(NOW) });

await page.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.host === "app.test") {
    const file = path.join(root, "src", url.pathname === "/" ? "index.html" : url.pathname);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ body: fs.readFileSync(file), contentType: types[file.split(".").pop()] || "application/octet-stream" });
  }
  if (url.host === "site.api.espn.com") {
    const lg = url.pathname.includes("/nfl/") ? "nfl" : "cfb";
    if (url.pathname.endsWith("/scoreboard")) {
      const wk = url.searchParams.get("week");
      const base = JSON.parse(fx(`${lg}-scoreboard.json`));
      if (wk && Number(wk) !== base.week.number) { base.events = []; base.week.number = Number(wk); }
      return route.fulfill({ body: JSON.stringify(base), contentType: "application/json" });
    }
    if (url.pathname.endsWith("/summary")) {
      const id = url.searchParams.get("event");
      const f = path.join(root, "tests/fixtures", `summary-${id}.json`);
      if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "{}" });
      const data = JSON.parse(fs.readFileSync(f, "utf8"));
      if (globalThis.beforeTd) {
        // Hold back the last touchdown drive and everything after it, so the next poll brings a new score.
        const i = data.drives.previous.findIndex((d) => d.plays.some((p) => /Smith for 38 yards for a TD/.test(p.text)));
        data.drives.previous = data.drives.previous.slice(0, i);
        delete data.drives.current;
      }
      return route.fulfill({ body: JSON.stringify(data), contentType: "application/json" });
      return route.fulfill({ status: 404, body: "{}" });
    }
  }
  // Fonts and logos are offline here; the app must fall back gracefully.
  return route.abort();
});

const shot = (n) => page.screenshot({ path: path.join(root, "tests/shots", n + ".png") });
const wait = (ms) => page.clock.runFor(ms).then(() => page.waitForTimeout(150));

await page.goto("http://app.test/#/schedule");
await page.waitForSelector(".guide, .sched", { timeout: 8000 });
await page.waitForTimeout(500);
await shot("01-schedule");
const blocks = await page.locator(".blk").count();
console.log("guide blocks:", blocks, "day tabs:", await page.locator(".daytab").count(), "sidebar games:", await page.locator(".side-game").count());

await page.locator(".blk").first().click();
await page.waitForTimeout(200);
await shot("02-schedule-detail");

await page.click('[data-league="nfl"]');
await page.waitForTimeout(400);
await shot("03-schedule-nfl");
await page.click('[data-league="all"]');

await page.goto("http://app.test/#/game/cfb/401900001");
await page.waitForSelector(".scorebug", { timeout: 8000 });
await page.waitForTimeout(800);
await shot("04-game");
console.log("play cards:", await page.locator(".pcard").count(), "drive bars:", await page.locator(".dbar").count());

await page.keyboard.press("ArrowLeft");
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(400);
await shot("05-game-stepped");

const td = page.locator(".pcard", { hasText: "for a TD" }).first();
if (await td.count()) { await td.click(); await page.waitForTimeout(400); await shot("06-game-td"); }

const box = page.locator('[data-action="tab"]').nth(1);
if (await box.count()) { await box.click(); await page.waitForTimeout(300); await shot("07-game-box"); }

// A touchdown arriving on the next poll should flash in the game pane.
globalThis.beforeTd = true;
await page.goto("http://app.test/#/schedule");
await page.goto("http://app.test/#/game/cfb/401900001");
await page.reload();
await page.waitForSelector(".scorebug");
await page.waitForTimeout(500);
console.log("flash before:", await page.locator(".flash").count());
globalThis.beforeTd = false;
await page.clock.runFor(11000);
await page.waitForTimeout(800);
console.log("flash after new TD:", await page.locator(".flash").count());
await shot("09-touchdown-flash");

await page.setViewportSize({ width: 1100, height: 700 });
await page.waitForTimeout(300);
await shot("08-game-small");

const real = errors.filter((e) => !e.includes("net::ERR_FAILED"));
console.log(real.length ? real.join("\n") : "no page errors");
await browser.close();
