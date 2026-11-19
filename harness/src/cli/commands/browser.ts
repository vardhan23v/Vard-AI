/**
 * `vard browser …`: the isolated test browser.
 *
 *   status                         which Chromium Vard will use
 *   install                        download Chrome Headless Shell (about 90 MB) into Playwright's cache
 *   test <url> [--viewports mobile,tablet,desktop]   responsive check with screenshots and a report
 *   artifacts | clean [--days N]   list or delete screenshots and reports in .vard/artifacts
 */
import path from "node:path";
import { checkUrl, cleanArtifacts, detectBrowser, installBrowser, listArtifacts, renderReport, testResponsive, ViewportName } from "../../browser";
import type { Ctx } from "../context";
import { gitRoot } from "./task";

export async function browserCommand(ctx: Ctx, args: string[], flags: { viewports?: string; days?: number }): Promise<number> {
  const t = ctx.theme;
  const root = gitRoot(ctx.cwd) ?? ctx.cwd;
  const [sub = "status", url] = args;
  const mgr = ctx.client.server.browser;
  try {
    switch (sub) {
      case "status": {
        const b = detectBrowser();
        if (b.installed) ctx.out.write(`${t.sage("✓")} ${b.name}${b.version ? ` (${b.version})` : ""}\n${t.muted(b.executable ?? "")}\n`);
        else ctx.out.write(`${t.star("No Chromium found.")} Install one with: vard browser install ${t.muted(`(${b.installable?.name} ${b.installable?.version}, about ${b.installable?.approxMB} MB)`)}\n`);
        return 0;
      }
      case "install": {
        const before = detectBrowser();
        if (before.installed && before.source === "playwright" && !args.includes("--force")) {
          ctx.out.write(`${t.sage("✓")} Already installed: ${before.name} (${before.version})\n`);
          return 0;
        }
        ctx.out.write(t.muted(`Downloading ${before.installable?.name} ${before.installable?.version} (about ${before.installable?.approxMB} MB)…\n`));
        let last = 0;
        const b = await installBrowser({
          onProgress: (r, n) => {
            if ((ctx.err as { isTTY?: boolean }).isTTY && Date.now() - last > 250) {
              last = Date.now();
              ctx.err.write(`\r${t.muted(`${(r / 1e6).toFixed(0)} / ${(n / 1e6).toFixed(0)} MB`)}   `);
            }
          },
        });
        if ((ctx.err as { isTTY?: boolean }).isTTY) ctx.err.write("\r\x1b[2K");
        ctx.out.write(`${t.sage("✓")} Installed ${b.name} at ${b.executable}\n`);
        return 0;
      }
      case "test": {
        if (!url) throw new Error("Usage: vard browser test <url> [--viewports mobile,tablet,desktop]");
        const c = checkUrl(url);
        if (c.action === "deny") throw new Error(c.reason);
        const viewports = (flags.viewports ?? "mobile,tablet,desktop").split(",").map((v) => ViewportName.parse(v.trim()));
        const s = await mgr.session(`cli-${Date.now()}`, { projectRoot: root, run: `cli-${new Date().toISOString().slice(0, 10)}` });
        if (c.origin) s.allowed.add(c.origin); // you typed this URL
        await mgr.act(s, "navigate", () => s.page().goto(url, { waitUntil: "load", timeout: 30_000 }));
        const r = await testResponsive(mgr, s, { url, viewports });
        ctx.out.write(`${renderReport(r)}\n\n${t.muted(`Report: ${path.relative(ctx.cwd, r.reportPath!)}`)}\n`);
        return r.findings.some((f) => f.severity === "high") ? 1 : 0;
      }
      case "artifacts": {
        const items = listArtifacts(root);
        if (!items.length) ctx.out.write(t.muted("No browser artifacts.\n"));
        for (const a of items.slice(0, 100)) ctx.out.write(`${path.relative(ctx.cwd, a.path)} ${t.muted(`${(a.bytes / 1024).toFixed(0)} KB`)}\n`);
        return 0;
      }
      case "clean": {
        const r = cleanArtifacts(root, { olderThanDays: flags.days });
        ctx.out.write(`${t.sage("✓")} Removed ${r.removed} file(s), ${(r.bytes / 1e6).toFixed(1)} MB.\n`);
        return 0;
      }
      default:
        ctx.err.write(`Unknown subcommand "${sub}". Try: vard browser status\n`);
        return 1;
    }
  } catch (e) {
    ctx.err.write(t.danger(`${(e as Error).message.split("\n")[0]}\n`));
    return 1;
  } finally {
    await mgr.closeAll().catch(() => {});
  }
}
