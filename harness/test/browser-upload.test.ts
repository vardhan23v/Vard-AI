import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { BrowserManager, browserTools, detectBrowser, DevServers } from "../src/browser";
import { MemoryRulesStore, Policy } from "../src/policy";
import type { ApprovalDecision, Event } from "../src/protocol";
import { Server } from "../src/server";
import type { ToolContext, ToolDef } from "../src/tools/types";
import { textOf } from "../src/tools/types";
import { scriptedModel, tmpDir, tmpGitRepo } from "./helpers";

const HAS_BROWSER = detectBrowser().installed;
if (!HAS_BROWSER)
  console.warn(
    "[browser upload tests] No Chromium found; browser tests are skipped. Run: vard browser install",
  );

const head = `<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px sans-serif} button{padding:12px;min-width:44px;min-height:44px}`;
const PAGES: Record<string, string> = {
  // A fixed header sits on top of a button near the top of the page.
  "/fixed": `<!doctype html><html lang="en"><head><title>F</title>${head} header{position:fixed;top:0;left:0;right:0;height:120px;background:#eee;z-index:10}</style></head><body>
    <header class="topbar"><span>Brand</span></header>
    <main><button id="hidden-btn" style="margin-top:20px">Covered action</button><div style="height:200px"></div></main></body></html>`,
  // An absolutely positioned overlay inside a relative container: ordinary stacking, not a finding.
  "/nested": `<!doctype html><html lang="en"><head><title>N</title>${head} .card{position:relative;margin-top:40px} .badge{position:absolute;inset:0;background:rgba(0,0,0,.1)}</style></head><body>
    <main><div class="card"><button>Normal action</button><span class="badge"></span></div></main></body></html>`,
  "/upload": `<!doctype html><html lang="en"><head><title>U</title></head><body>
    <label>Attachment <input id="file" type="file" multiple></label>
    <button id="pick" type="button">Choose a file</button>
    <p id="out">chosen: none</p>
    <script>
      const out = document.getElementById("out");
      const show = (files) => { out.textContent = "chosen: " + [...files].map((f) => f.name).join(", "); };
      document.getElementById("file").addEventListener("change", (e) => show(e.target.files));
      document.getElementById("pick").addEventListener("click", () => {
        const i = document.createElement("input");
        i.type = "file";
        i.addEventListener("change", () => show(i.files));
        i.click();
      });
    </script></body></html>`,
};

let server: ReturnType<typeof Bun.serve>;
let base = "";
beforeAll(() => {
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const body = PAGES[new URL(req.url).pathname];
      return body === undefined
        ? new Response("not found", { status: 404 })
        : new Response(body, { headers: { "content-type": "text/html" } });
    },
  });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(() => server?.stop(true));

function setup(files?: Record<string, string>) {
  const project = tmpGitRepo(files);
  const mgr = new BrowserManager();
  const tools = browserTools({ mgr, dev: new DevServers() });
  const t = (n: string) => tools.find((x) => x.name === n)! as ToolDef<any>;
  const ctx: ToolContext = {
    workRoot: project,
    projectRoot: project,
    todos: [],
    setTodos() {},
    taskId: "u1",
  };
  const run = async (n: string, input: object) =>
    textOf(await t(n).execute(t(n).inputSchema.parse(input), ctx));
  return { project, mgr, tools, run };
}

describe("browser_upload policy", () => {
  test("asks every time with the file list (no always); credential files are denied", () => {
    const { tools, project } = setup();
    const up = tools.find((x) => x.name === "browser_upload")!;
    const store = new MemoryRulesStore();
    const policy = new Policy({ projectRoot: project, workRoot: project, store });
    const d = policy.decide(up, { selector: "#file", files: ["docs/a.txt", "b.png"] });
    expect(d).toMatchObject({ action: "ask", noAlways: true });
    expect(d.reason).toContain("docs/a.txt");
    expect(d.reason).toContain("b.png");
    expect(policy.remember(up, { selector: "#file", files: ["b.png"] })).toBe(false);
    expect(policy.decide(up, { selector: "#file", files: ["b.png"] }).action).toBe("ask");
    expect(policy.decide(up, { selector: "#file", files: ["config/.env"] }).action).toBe("deny");
  });
});

describe.skipIf(!HAS_BROWSER)("overlap check (real Chromium)", () => {
  const desktop = async (page: string) => {
    const { mgr, run } = setup();
    await run("browser_navigate", { url: `${base}${page}` });
    const r = await run("browser_test_responsive", { viewports: ["desktop"] });
    await mgr.closeAll();
    return r;
  };

  test("a button under a fixed header is reported, with evidence", async () => {
    const r = await desktop("/fixed");
    expect(r).toContain("Covered action");
    expect(r).toContain("position: fixed");
    expect(r).toContain("header.topbar");
    expect(r).toMatch(/overlap \d+,\d+ \d+×\d+px/);
  }, 90_000);

  test("an ordinarily stacked overlay is not reported", async () => {
    const r = await desktop("/nested");
    expect(r).not.toContain("Normal action");
    expect(r).not.toMatch(/covered by/i);
  }, 90_000);
});

describe.skipIf(!HAS_BROWSER)("browser_upload tool (real Chromium)", () => {
  test("refuses files outside the project, credential files, missing files and folders", async () => {
    const outside = path.join(tmpDir(), "outside.txt");
    fs.writeFileSync(outside, "x");
    const { project, mgr, run } = setup({ "a.txt": "a", ".env": "SECRET=1", "sub/b.txt": "b" });
    fs.symlinkSync(outside, path.join(project, "link.txt"));
    await run("browser_navigate", { url: `${base}/upload` });
    const refused = async (f: string) =>
      run("browser_upload", { selector: "#file", files: [f] }).then(
        (out) => `uploaded: ${out}`,
        (e: Error) => e.message,
      );
    expect(await refused(outside)).toContain("outside the project");
    expect(await refused("../outside.txt")).toMatch(/outside the project|doesn't exist/);
    expect(await refused("link.txt")).toContain("outside the project");
    expect(await refused(".env")).toContain("credential");
    expect(await refused("missing.txt")).toContain("doesn't exist");
    expect(await refused("sub")).toContain("not a file");
    const page = mgr.sessions.get("u1")!.page();
    expect(await page.locator("#out").innerText()).toBe("chosen: none");
    // A project file works directly; output has names only, wrapped as page output.
    const ok = await run("browser_upload", { selector: "#file", files: ["a.txt", "sub/b.txt"] });
    expect(ok).toContain("a.txt, b.txt");
    expect(ok).toContain("<untrusted-page-content");
    expect(ok).not.toContain(project);
    expect(await page.locator("#out").innerText()).toBe("chosen: a.txt, b.txt");
    // A button that opens a file picker.
    expect(await run("browser_upload", { selector: "#pick", files: ["a.txt"] })).toContain("a.txt");
    expect(await page.locator("#out").innerText()).toBe("chosen: a.txt");
    await mgr.closeAll();
  }, 60_000);

  const inTask = async (decision: ApprovalDecision) => {
    const repo = tmpGitRepo({ "report.txt": "the report\n" });
    const turns = [
      { calls: [{ name: "browser_navigate", input: { url: `${base}/upload` } }] },
      { calls: [{ name: "browser_upload", input: { selector: "#file", files: ["report.txt"] } }] },
      { calls: [{ name: "browser_get_page", input: {} }] },
      { text: "Done." },
    ];
    const events: Event[] = [];
    let done!: () => void;
    const finished = new Promise<void>((r) => (done = r));
    let s!: Server;
    // eslint-disable-next-line prefer-const -- declared earlier so callbacks created first can read it
    s = new Server({
      traceDir: tmpDir(),
      modelFactory: () => scriptedModel(turns),
      rulesStoreFor: () => new MemoryRulesStore(),
      write: (e) => {
        events.push(e);
        if (e.type === "approval_request")
          queueMicrotask(() =>
            s.handle({
              id: "a",
              type: "task.approve",
              taskId: e.taskId!,
              approvalId: e.approvalId,
              decision,
            }),
          );
        if (e.type === "done" && e.taskId) done();
      },
    });
    await s.handle({
      id: "t",
      type: "task.start",
      taskId: `up-${decision}`,
      projectRoot: repo,
      prompt: "upload the report on the page in the browser",
      provider: { provider: "anthropic", model: "claude-test", apiKey: "k" },
      planFirst: false,
      useWorktree: false,
      useMemory: false,
      codeIndex: false,
    });
    await finished;
    await s.shutdown();
    const approvals = events.filter((e) => e.type === "approval_request") as any[];
    const results = events.filter((e) => e.type === "tool_result") as any[];
    return { approvals, results };
  };

  test("after approval the upload happens and the page sees the file name", async () => {
    const { approvals, results } = await inTask("allow_once");
    expect(approvals.map((a) => a.tool)).toEqual(["browser_upload"]);
    expect(approvals[0].noAlways).toBe(true);
    expect(approvals[0].reason).toContain("report.txt");
    const up = results.find((r) => r.tool === "browser_upload");
    expect(up.ok).toBe(true);
    expect(up.output).not.toContain("the report");
    expect(results.find((r) => r.tool === "browser_get_page").output).toContain(
      "chosen: report.txt",
    );
  }, 60_000);

  test("a denial blocks the upload", async () => {
    const { approvals, results } = await inTask("deny");
    expect(approvals.map((a) => a.tool)).toEqual(["browser_upload"]);
    expect(results.find((r) => r.tool === "browser_upload").ok).toBe(false);
    const page = results.find((r) => r.tool === "browser_get_page").output;
    expect(page).toContain("chosen: none");
    expect(page).not.toContain("report.txt");
  }, 60_000);
});
