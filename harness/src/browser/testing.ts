/**
 * Responsive testing: for each viewport, load the page, measure the DOM, take a screenshot, and
 * collect console and network problems. The report (JSON + Markdown) is saved with the artifacts.
 */
import fs from "node:fs";
import path from "node:path";
import { measurePage } from "./inspect";
import type { BrowserManager } from "./manager";
import { VIEWPORTS, type BrowserReport, type Finding, type ViewportName } from "./schema";
import type { BrowserSession } from "./session";

export async function testResponsive(
  mgr: BrowserManager,
  s: BrowserSession,
  o: { url?: string; viewports: ViewportName[]; fullPage?: boolean; signal?: AbortSignal },
): Promise<BrowserReport> {
  const url = o.url ?? s.lastUrl;
  if (!url || url === "about:blank")
    throw new Error("Open the page first (browser_navigate) or pass a url.");
  const c0 = s.console.length;
  const n0 = s.network.length;
  const findings: Finding[] = [];
  const shots: BrowserReport["screenshots"] = [];
  for (const vp of o.viewports) {
    if (o.signal?.aborted) throw new Error("cancelled");
    await mgr.act(
      s,
      `test ${vp}`,
      async () => {
        await mgr.setViewport(s, vp);
        const p = s.page();
        await p.goto(url, { waitUntil: "load", timeout: 30_000 });
        await p.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
        const shot = await s.screenshot({
          label: `${vp}`,
          fullPage: o.fullPage ?? true,
          viewport: vp,
        });
        shots.push(shot);
        for (const f of await measurePage(p, vp, VIEWPORTS[vp].hasTouch, VIEWPORTS[vp].width))
          findings.push({ ...f, screenshot: shot.path });
      },
      o.signal,
    );
  }
  const consoleNew = s.console.slice(c0).filter((c) => c.type !== "info");
  const networkNew = s.network.slice(n0);
  for (const c of consoleNew
    .filter((c) => c.type === "error" || c.type === "pageerror")
    .slice(0, 10))
    findings.push({
      viewport: "all",
      severity: c.type === "pageerror" ? "high" : "medium",
      kind: "console_error",
      message: c.text.slice(0, 200),
      evidence: `${c.type}${c.url ? ` at ${c.url}${c.line !== undefined ? `:${c.line}` : ""}` : ""}`,
    });
  for (const n of networkNew.slice(0, 10))
    findings.push({
      viewport: "all",
      severity: n.status && n.status >= 500 ? "high" : "medium",
      kind: "network_error",
      message: `${n.method} ${n.url} ${n.status ?? n.error ?? ""}`.trim(),
      evidence: `${n.kind}${n.resource ? ` (${n.resource})` : ""}`,
    });

  // The same problem in several viewports is reported once per viewport; collapse exact repeats.
  const seen = new Set<string>();
  const unique = findings.filter((f) => {
    const k = `${f.viewport}|${f.kind}|${f.selector ?? ""}|${f.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const bySev = (sev: string) => unique.filter((f) => f.severity === sev).length;
  const summary = unique.length
    ? `${unique.length} finding(s) across ${o.viewports.join(", ")}: ${bySev("high")} high, ${bySev("medium")} medium, ${bySev("low")} low.`
    : `No layout, console or network problems found in ${o.viewports.join(", ")}.`;
  const report: BrowserReport = {
    url,
    viewports: o.viewports,
    findings: unique,
    screenshots: shots,
    console: consoleNew.slice(-50),
    network: networkNew.slice(-50),
    summary,
    at: Date.now(),
  };
  const base = path.join(
    s.artifactsDir,
    `report-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  fs.writeFileSync(`${base}.json`, JSON.stringify(report, null, 2));
  fs.writeFileSync(`${base}.md`, renderReport(report));
  report.reportPath = `${base}.md`;
  return report;
}

export function renderReport(r: BrowserReport): string {
  const L = [`# Browser test: ${r.url}`, "", r.summary, ""];
  for (const vp of [...r.viewports, "all"]) {
    const fs_ = r.findings.filter((f) => f.viewport === vp);
    if (!fs_.length) continue;
    L.push(`## ${vp}`);
    for (const f of fs_)
      L.push(
        `- **${f.severity}** ${f.kind.replace(/_/g, " ")}: ${f.message}${f.selector ? ` (\`${f.selector}\`)` : ""} — ${f.evidence}`,
      );
    L.push("");
  }
  if (r.screenshots.length)
    L.push("## Screenshots", ...r.screenshots.map((s) => `- ${s.viewport}: ${s.path}`));
  return L.join("\n");
}
