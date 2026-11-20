import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { applyRetention, BrowserManager, browserSettingsPath, browserTools, detectBrowser, DevServers, listArtifacts, loadBrowserSettings, saveBrowserSettings } from "../src/browser";
import { MemoryRulesStore } from "../src/policy";
import { type Event, parseRequest } from "../src/protocol";
import { Server } from "../src/server";
import type { ToolContext, ToolDef } from "../src/tools/types";
import { textOf } from "../src/tools/types";
import { tmpDir, tmpGitRepo } from "./helpers";

const HAS_BROWSER = detectBrowser().installed;
if (!HAS_BROWSER) console.warn("[browser gap tests] No Chromium found; browser tests are skipped. Run: vard browser install");

const head = `<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px sans-serif} a,button{display:inline-block;padding:12px;min-width:44px;min-height:44px}`;
const PAGES: Record<string, string> = {
  // Links straight in <header>, hidden on small screens, no <nav> and no toggle.
  "/header-links": `<!doctype html><html lang="en"><head><title>H</title>${head} @media (max-width:600px){ .links{display:none} }</style></head><body>
    <header><a href="/" class="logo">Logo</a><span class="links"><a href="/a">About</a><a href="/p">Pricing</a><a href="/c">Contact</a></span></header>
    <main><h1>Hi</h1></main></body></html>`,
  // Same, but a visible menu button in the header controls the hidden links.
  "/header-toggle": `<!doctype html><html lang="en"><head><title>H</title>${head} @media (max-width:600px){ #links{display:none} } @media (min-width:601px){ #menu{display:none} }</style></head><body>
    <header><a href="/" class="logo">Logo</a><button id="menu" aria-controls="links" aria-label="Open menu">☰</button><span id="links"><a href="/a">About</a><a href="/p">Pricing</a><a href="/c">Contact</a></span></header>
    <main><h1>Hi</h1></main></body></html>`,
  // Hidden header links plus an unrelated aria-expanded button elsewhere (an FAQ accordion).
  "/header-unrelated": `<!doctype html><html lang="en"><head><title>H</title>${head} @media (max-width:600px){ .links{display:none} }</style></head><body>
    <header><a href="/" class="logo">Logo</a><span class="links"><a href="/a">About</a><a href="/p">Pricing</a><a href="/c">Contact</a></span></header>
    <main><h1>FAQ</h1><button aria-expanded="false" aria-controls="ans">What is it?</button><div id="ans" hidden>Something.</div></main></body></html>`,
  // A button collapsed to 0×0 by layout (not display:none), and one hidden properly (not reported).
  "/zero": `<!doctype html><html lang="en"><head><title>Z</title>${head} .collapsed{width:0;height:0;padding:0;min-width:0;min-height:0;overflow:hidden;border:0}</style></head><body>
    <main><h1>Z</h1><button class="collapsed">Save changes</button><button style="display:none">Gone</button><button hidden>Also gone</button><a href="/x" aria-hidden="true" class="collapsed"></a></main></body></html>`,
};

let server: ReturnType<typeof Bun.serve>;
let base = "";
beforeAll(() => {
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const body = PAGES[new URL(req.url).pathname];
      return body === undefined ? new Response("not found", { status: 404 }) : new Response(body, { headers: { "content-type": "text/html" } });
    },
  });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(() => server?.stop(true));

function setup() {
  const project = tmpGitRepo();
  const mgr = new BrowserManager();
  const tools = browserTools({ mgr, dev: new DevServers() });
  const t = (n: string) => tools.find((x) => x.name === n)! as ToolDef<any>;
  const ctx: ToolContext = { workRoot: project, projectRoot: project, todos: [], setTodos() {}, taskId: "g1" };
  const run = async (n: string, input: object) => textOf(await t(n).execute(t(n).inputSchema.parse(input), ctx));
  const responsive = async (page: string) => {
    await run("browser_navigate", { url: `${base}${page}` });
    const r = await run("browser_test_responsive", { viewports: ["mobile", "desktop"] });
    return { all: r, mobile: r.split("## mobile")[1]?.split("##")[0] ?? "", desktop: r.split("## desktop")[1]?.split("##")[0] ?? "" };
  };
  return { mgr, responsive };
}

describe.skipIf(!HAS_BROWSER)("inspect gaps (real Chromium, local pages)", () => {
  test("links hidden in a <header> (no <nav>) are reported at mobile, with evidence", async () => {
    const { mgr, responsive } = setup();
    const r = await responsive("/header-links");
    expect(r.mobile).toContain("hidden navigation");
    expect(r.mobile).toContain("header");
    expect(r.mobile).toMatch(/3 navigation link\(s\) hidden, 1 visible/);
    expect(r.mobile).toContain("display:none");
    expect(r.desktop).not.toContain("hidden navigation");
    await mgr.closeAll();
  }, 90_000);

  test("a visible toggle with aria-controls pointing at the hidden links suppresses it", async () => {
    const { mgr, responsive } = setup();
    const r = await responsive("/header-toggle");
    expect(r.all).not.toContain("hidden navigation");
    await mgr.closeAll();
  }, 90_000);

  test("an unrelated aria-expanded button elsewhere doesn't suppress it", async () => {
    const { mgr, responsive } = setup();
    const r = await responsive("/header-unrelated");
    expect(r.mobile).toContain("hidden navigation");
    await mgr.closeAll();
  }, 90_000);

  test("zero-size controls are reported; display:none, hidden and aria-hidden ones aren't", async () => {
    const { mgr, responsive } = setup();
    const r = await responsive("/zero");
    expect(r.desktop).toContain("zero size control");
    expect(r.desktop).toContain("Save changes");
    expect(r.desktop).toMatch(/0×0px/);
    expect(r.all).not.toContain("Gone");
    expect(r.all).not.toContain("Also gone");
    expect(r.desktop.match(/zero size control/g)?.length).toBe(1);
    await mgr.closeAll();
  }, 90_000);
});

function server_(o: { store?: MemoryRulesStore; home?: string } = {}) {
  const events: Event[] = [];
  const s = new Server({ write: (e) => events.push(e), ...(o.store ? { rulesStoreFor: () => o.store! } : {}), skillsHome: o.home ?? tmpDir() });
  return { s, events, last: <T extends Event["type"]>(type: T) => events.filter((e) => e.type === type).at(-1) as Extract<Event, { type: T }> | undefined };
}

describe("remembered browser origins", () => {
  test("protocol shapes parse", () => {
    expect(parseRequest(JSON.stringify({ id: "1", type: "browser.origins", projectRoot: "/p" })).ok).toBe(true);
    expect(parseRequest(JSON.stringify({ id: "1", type: "browser.origins", projectRoot: "/p", remove: "https://a.example" })).ok).toBe(true);
    expect(parseRequest(JSON.stringify({ id: "1", type: "browser.origins", projectRoot: "" })).ok).toBe(false);
    expect(parseRequest(JSON.stringify({ id: "1", type: "browser.settings" })).ok).toBe(true);
    expect(parseRequest(JSON.stringify({ id: "1", type: "browser.settings", settings: { artifactRetentionDays: 30 } })).ok).toBe(true);
    expect(parseRequest(JSON.stringify({ id: "1", type: "browser.settings", settings: { artifactRetentionDays: 366 } })).ok).toBe(false);
    expect(parseRequest(JSON.stringify({ id: "1", type: "browser.settings", settings: { artifactRetentionDays: 1.5 } })).ok).toBe(false);
  });

  test("list and remove through Server.handle (rules store)", async () => {
    const store = new MemoryRulesStore({ allowlist: ["bun test"], tools: [], browserOrigins: ["https://staging.example.com", "https://preview.example.com"] });
    const { s, last } = server_({ store });
    await s.handle({ id: "o1", type: "browser.origins", projectRoot: "/proj" });
    expect(last("browser_origins")).toMatchObject({ id: "o1", projectRoot: "/proj", origins: ["https://staging.example.com", "https://preview.example.com"] });
    await s.handle({ id: "o2", type: "browser.origins", projectRoot: "/proj", remove: "https://staging.example.com/" });
    expect(last("browser_origins")!.origins).toEqual(["https://preview.example.com"]);
    expect(store.rules.browserOrigins).toEqual(["https://preview.example.com"]);
    expect(store.rules.allowlist).toEqual(["bun test"]);
    await s.handle({ id: "o3", type: "browser.origins", projectRoot: "/proj", remove: "https://unknown.example" });
    expect(last("browser_origins")!.origins).toEqual(["https://preview.example.com"]);
  });

  test("a project's policy.json on disk", async () => {
    const project = tmpDir();
    fs.mkdirSync(path.join(project, ".vard"), { recursive: true });
    fs.writeFileSync(path.join(project, ".vard", "policy.json"), JSON.stringify({ allowlist: [], tools: [], browserOrigins: ["https://a.example"] }));
    const { s, last } = server_();
    await s.handle({ id: "o", type: "browser.origins", projectRoot: project, remove: "https://a.example" });
    expect(last("browser_origins")!.origins).toEqual([]);
    expect(JSON.parse(fs.readFileSync(path.join(project, ".vard", "policy.json"), "utf8")).browserOrigins).toEqual([]);
  });
});

describe("browser settings and artifact retention", () => {
  const DAY = 86_400_000;
  const makeRun = (project: string, run: string, ageDays: number) => {
    const dir = path.join(project, ".vard", "artifacts", run);
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, "shot.png");
    fs.writeFileSync(f, "png");
    const t = new Date(Date.now() - ageDays * DAY);
    fs.utimesSync(f, t, t);
  };
  const runs = (project: string) => [...new Set(listArtifacts(project).map((a) => a.run))].sort();

  test("save and load (default 0) in <home>/browser.json", async () => {
    const home = tmpDir();
    expect(loadBrowserSettings(home)).toEqual({ artifactRetentionDays: 0 });
    const { s, last } = server_({ home });
    await s.handle({ id: "g", type: "browser.settings" });
    expect(last("browser_settings")).toMatchObject({ id: "g", settings: { artifactRetentionDays: 0 } });
    await s.handle({ id: "p", type: "browser.settings", settings: { artifactRetentionDays: 14 } });
    expect(last("browser_settings")!.settings).toEqual({ artifactRetentionDays: 14 });
    expect(JSON.parse(fs.readFileSync(browserSettingsPath(home), "utf8"))).toEqual({ artifactRetentionDays: 14 });
    const again = server_({ home });
    await again.s.handle({ id: "g2", type: "browser.settings" });
    expect(again.last("browser_settings")!.settings.artifactRetentionDays).toBe(14);
  });

  test("retention 0 keeps everything; artifacts.list cleans runs older than N days", async () => {
    const home = tmpDir();
    const project = tmpDir();
    makeRun(project, "old-run", 40);
    makeRun(project, "fresh-run", 1);
    const { s, last } = server_({ home });
    await s.handle({ id: "l0", type: "artifacts.list", projectRoot: project });
    expect(new Set(last("artifacts")!.items.map((i) => i.run))).toEqual(new Set(["old-run", "fresh-run"]));
    saveBrowserSettings({ artifactRetentionDays: 30 }, home);
    await s.handle({ id: "l1", type: "artifacts.list", projectRoot: project });
    expect(last("artifacts")!.items.map((i) => i.run)).toEqual(["fresh-run"]);
    expect(fs.existsSync(path.join(project, ".vard", "artifacts", "old-run"))).toBe(false);
  });

  test("never deletes a running task's artifacts; endBrowserWork cleans its project", async () => {
    const home = tmpDir();
    const project = tmpDir();
    saveBrowserSettings({ artifactRetentionDays: 7 }, home);
    makeRun(project, "running-task", 30);
    makeRun(project, "ended-task", 30);
    makeRun(project, "older", 30);
    makeRun(project, "fresh", 0);
    expect(applyRetention(project, { home, keepRuns: ["running-task", "ended-task"] }).removed).toBe(1);
    expect(runs(project)).toEqual(["ended-task", "fresh", "running-task"]);

    const { s } = server_({ home });
    const tasks = (s as unknown as { tasks: Map<string, { taskId: string; projectRoot: string; running: boolean }> }).tasks;
    tasks.set("running-task", { taskId: "running-task", projectRoot: project, running: true } as any);
    tasks.set("ended-task", { taskId: "ended-task", projectRoot: project, running: false } as any);
    await s.endBrowserWork("ended-task");
    expect(runs(project)).toEqual(["fresh", "running-task"]);
    tasks.clear();
  });
});
