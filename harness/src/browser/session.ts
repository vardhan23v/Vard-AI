/// <reference lib="dom" />
/**
 * One isolated browser session: its own context (fresh cookies and storage, no downloads, no
 * service workers), its tabs, console and network logs, screenshots and the origins the user
 * approved during this run. Navigation to anything not allowed is blocked at the network layer,
 * so redirects and links can't leave the allowed set either.
 */
import fs from "node:fs";
import path from "node:path";
import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import { BrowserError } from "./errors";
import { checkUrl, redactUrl } from "./permissions";
import { VIEWPORTS, type ConsoleEntry, type NetworkEntry, type Screenshot, type Viewport } from "./schema";

const MAX_LOG = 300;
const MAX_TABS = 8;
export const DEFAULT_TIMEOUT = 15_000;
const MAX_FULLPAGE_HEIGHT = 8_000;

export interface Target {
  role?: string;
  name?: string;
  label?: string;
  text?: string;
  placeholder?: string;
  testId?: string;
  selector?: string;
  exact?: boolean;
  nth?: number;
}

export function describeTarget(t: Target): string {
  if (t.role) return `${t.role}${t.name ? ` "${t.name}"` : ""}`;
  if (t.label) return `field labelled "${t.label}"`;
  if (t.text) return `"${t.text}"`;
  if (t.placeholder) return `field with placeholder "${t.placeholder}"`;
  if (t.testId) return `test id ${t.testId}`;
  return t.selector ?? "element";
}

export class BrowserSession {
  context!: BrowserContext;
  pages: Page[] = [];
  active = 0;
  console: ConsoleEntry[] = [];
  network: NetworkEntry[] = [];
  screenshots: Screenshot[] = [];
  /** Origins (outside localhost) approved during this run. */
  allowed = new Set<string>();
  viewportName = "laptop";
  viewport: Viewport = { ...VIEWPORTS.laptop };
  state: "starting" | "ready" | "busy" | "crashed" | "closed" = "starting";
  lastUrl?: string;
  lastAction?: string;
  readonly startedAt = Date.now();
  private shot = 0;
  private blockedAt = 0;

  constructor(
    readonly id: string,
    readonly artifactsDir: string,
    readonly info: { taskId?: string; agentId?: string; projectOrigins: () => string[] },
    private onChange: () => void,
  ) {}

  page(): Page {
    const p = this.pages[this.active];
    if (!p || p.isClosed()) throw new BrowserError("closed", "no open page; navigate first");
    return p;
  }

  private push<T>(list: T[], e: T) {
    list.push(e);
    if (list.length > MAX_LOG) list.splice(0, list.length - MAX_LOG);
  }

  isAllowed(url: string): boolean {
    return checkUrl(url, [...this.allowed, ...this.info.projectOrigins()]).action === "allow";
  }

  async open(browser: Browser) {
    const v = this.viewport;
    this.context = await browser.newContext({
      viewport: { width: v.width, height: v.height },
      deviceScaleFactor: v.deviceScaleFactor,
      isMobile: v.isMobile,
      hasTouch: v.hasTouch,
      acceptDownloads: false,
      serviceWorkers: "block",
      locale: "en-US",
    });
    this.context.setDefaultTimeout(DEFAULT_TIMEOUT);
    await this.context.route("**/*", (route) => {
      const req = route.request();
      if (req.isNavigationRequest() && !this.isAllowed(req.url())) {
        this.push(this.network, { kind: "blocked", method: req.method(), url: redactUrl(req.url()), error: "navigation outside the allowed sites was blocked", at: Date.now() });
        if (req.frame() === req.frame().page().mainFrame()) this.blockedAt = Date.now();
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    this.context.on("page", (p) => this.attach(p));
    this.pages = [];
    const page = await this.context.newPage();
    this.active = 0;
    this.state = "ready";
    if (this.lastUrl && this.lastUrl !== "about:blank" && this.isAllowed(this.lastUrl)) await page.goto(this.lastUrl, { waitUntil: "load" }).catch(() => {});
    this.onChange();
    return page;
  }

  private attach(p: Page) {
    if (this.pages.includes(p)) return;
    if (this.pages.filter((x) => !x.isClosed()).length >= MAX_TABS) {
      void p.close();
      return;
    }
    this.pages.push(p);
    this.active = this.pages.length - 1;
    p.on("console", (m) => {
      const t = m.type();
      if (t !== "error" && t !== "warning") return;
      const loc = m.location();
      this.push(this.console, { type: t === "error" ? "error" : "warning", text: m.text().slice(0, 1_000), url: loc.url ? redactUrl(loc.url) : undefined, line: loc.lineNumber, at: Date.now() });
      this.onChange();
    });
    p.on("pageerror", (e) => {
      this.push(this.console, { type: "pageerror", text: `${e.name}: ${e.message}`.slice(0, 1_000), at: Date.now() });
      this.onChange();
    });
    p.on("requestfailed", (r) => {
      const err = r.failure()?.errorText ?? "failed";
      if (err.includes("BLOCKED_BY_CLIENT")) return; // recorded by the route guard
      this.push(this.network, { kind: "failed", method: r.method(), url: redactUrl(r.url()), error: err, resource: r.resourceType(), at: Date.now() });
      this.onChange();
    });
    p.on("response", (r) => {
      if (r.status() < 400) return;
      this.push(this.network, { kind: "http_error", method: r.request().method(), url: redactUrl(r.url()), status: r.status(), resource: r.request().resourceType(), at: Date.now() });
      this.onChange();
    });
    p.on("dialog", (d) => {
      this.push(this.console, { type: "info", text: `${d.type()} dialog dismissed: ${d.message().slice(0, 300)}`, at: Date.now() });
      void d.dismiss().catch(() => {});
    });
    p.on("download", (d) => {
      this.push(this.network, { kind: "blocked", method: "GET", url: redactUrl(d.url()), error: "downloads are disabled", at: Date.now() });
      void d.cancel().catch(() => {});
    });
    p.on("framenavigated", (f) => {
      if (f === p.mainFrame()) {
        // A blocked navigation leaves Chrome's error page; go back to where we were.
        if (f.url().startsWith("chrome-error://")) {
          if (Date.now() - this.blockedAt < 5_000) void p.goBack().catch(() => {});
          return;
        }
        this.lastUrl = f.url();
        this.onChange();
      }
    });
    p.on("close", () => {
      if (this.pages[this.active] === p) this.active = Math.max(0, this.pages.findIndex((x) => !x.isClosed()));
    });
  }

  locate(t: Target): Locator {
    const p = this.page();
    let l: Locator;
    if (t.role) l = p.getByRole(t.role as Parameters<Page["getByRole"]>[0], t.name ? { name: t.name, exact: t.exact } : {});
    else if (t.label) l = p.getByLabel(t.label, { exact: t.exact });
    else if (t.text) l = p.getByText(t.text, { exact: t.exact });
    else if (t.placeholder) l = p.getByPlaceholder(t.placeholder, { exact: t.exact });
    else if (t.testId) l = p.getByTestId(t.testId);
    else if (t.selector) l = p.locator(t.selector);
    else throw new BrowserError("not_found", "say which element: role and name, label, text, placeholder, testId or selector");
    return t.nth !== undefined ? l.nth(t.nth) : l.first();
  }

  /** What an element is, for the sensitive-action check. */
  async describe(l: Locator, timeout: number): Promise<string> {
    return l.evaluate(
      (el) => {
        const a = (n: string) => el.getAttribute(n) ?? "";
        const label = (el as HTMLInputElement).labels ? [...((el as HTMLInputElement).labels ?? [])].map((x) => x.innerText).join(" ") : "";
        const form = el.closest("form");
        return [el.tagName, a("type"), a("name"), a("id"), a("autocomplete"), a("aria-label"), a("value"), label, (el as HTMLElement).innerText?.slice(0, 120), form ? `${form.getAttribute("action") ?? ""} ${form.getAttribute("name") ?? ""}` : ""].join(" ");
      },
      undefined,
      { timeout },
    );
  }

  async screenshot(o: { label: string; fullPage?: boolean; target?: Target; viewport?: string }): Promise<Screenshot> {
    const p = this.page();
    const n = ++this.shot;
    const file = path.join(this.artifactsDir, `${String(n).padStart(3, "0")}-${o.label.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 40)}.png`);
    let width = this.viewport.width;
    let height = this.viewport.height;
    if (o.target) {
      const l = this.locate(o.target);
      await l.screenshot({ path: file, timeout: DEFAULT_TIMEOUT });
      const b = await l.boundingBox();
      width = Math.round(b?.width ?? 0);
      height = Math.round(b?.height ?? 0);
    } else if (o.fullPage) {
      const h = await p.evaluate(() => document.documentElement.scrollHeight);
      height = Math.min(h, MAX_FULLPAGE_HEIGHT);
      await p.screenshot({ path: file, fullPage: h <= MAX_FULLPAGE_HEIGHT, clip: h > MAX_FULLPAGE_HEIGHT ? { x: 0, y: 0, width, height } : undefined, timeout: 30_000 });
    } else await p.screenshot({ path: file, timeout: 30_000 });
    const s: Screenshot = { path: file, label: o.label, viewport: o.viewport ?? this.viewportName, width, height, at: Date.now() };
    this.screenshots.push(s);
    this.onChange();
    return s;
  }

  async close() {
    this.state = "closed";
    await this.context?.close().catch(() => {});
    this.onChange();
  }

  ensureDir() {
    fs.mkdirSync(this.artifactsDir, { recursive: true });
  }
}
