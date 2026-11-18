/**
 * `vard mcp …`: manage MCP servers from the terminal (same config, Keychain and permissions as
 * the app). Global by default; `--project` targets the current repo's .vard/mcp.json.
 *
 *   list                                   servers and status
 *   add <id> -- <command> [args…]          local (stdio) server
 *   add <id> --url <url> [--bearer]        remote (Streamable HTTP) server
 *   remove | enable | disable <id>
 *   test <id>                              connect once and report what it offers
 *   tools | resources | prompts <id>
 *   secret <id> <NAME>                     store a secret (hidden prompt or piped)
 *   trust | untrust                        the project's .vard/mcp.json
 *   import <claude|cursor|windsurf|file>   other apps' configs (imported disabled)
 *   permissions [allow|deny|reset <server/tool>] | revoke [prefix]
 */
import { knownImportSources, McpError, type McpScope } from "../../mcp";
import { Policy } from "../../policy";
import type { Ctx } from "../context";
import { gitRoot } from "./task";

const STATE: Record<string, string> = {
  connected: "connected",
  connecting: "connecting",
  disconnected: "not connected",
  error: "error",
  needs_trust: "needs trust",
  needs_auth: "sign-in needed",
  disabled: "disabled",
};

export async function mcpCommand(
  ctx: Ctx,
  args: string[],
  flags: { project?: boolean; url?: string; bearer?: boolean; name?: string },
): Promise<number> {
  const t = ctx.theme;
  const m = ctx.client.server.mcp;
  const projectRoot = gitRoot(ctx.cwd) ?? ctx.cwd;
  const scope: McpScope = flags.project ? "project" : "global";
  const [sub = "list", id, ...rest] = args;
  const ref = (sid = id) => {
    if (!sid) throw new McpError("config", "Which server? Run `vard mcp list`.");
    const hit = m.configs(projectRoot).filter((c) => c.config.id === sid);
    const pick = hit.find((c) => c.scope === scope) ?? hit[0];
    if (!pick) throw new McpError("config", `No server "${sid}". Run \`vard mcp list\`.`);
    return { scope: pick.scope, id: sid, projectRoot };
  };
  try {
    switch (sub) {
      case "list":
      case "ls": {
        const list = m.status(projectRoot);
        if (!list.length) {
          ctx.out.write(
            t.muted(
              "No MCP servers yet. Add one: vard mcp add everything -- npx -y @modelcontextprotocol/server-everything\n",
            ),
          );
          return 0;
        }
        for (const s of list) {
          const state =
            s.state === "connected"
              ? t.sage(STATE[s.state])
              : s.state === "error"
                ? t.danger(STATE[s.state])
                : t.muted(STATE[s.state]);
          ctx.out.write(
            `${t.bold(s.id.padEnd(20))} ${state}  ${t.muted(`${s.scope} · ${s.transport} · ${s.target.slice(0, 60)}`)}\n`,
          );
          if (s.error) ctx.out.write(`  ${t.danger(s.error)}\n`);
          const missing = s.secrets.filter((x) => !x.set).map((x) => x.name);
          if (missing.length)
            ctx.out.write(
              `  ${t.star(`missing secrets: ${missing.join(", ")} (vard mcp secret ${s.id} <NAME>)`)}\n`,
            );
        }
        if (list.some((s) => s.state === "needs_trust"))
          ctx.out.write(
            t.star(
              "\nThis project's .vard/mcp.json isn't trusted yet. Review it, then: vard mcp trust\n",
            ),
          );
        return 0;
      }
      case "add": {
        if (!id)
          throw new McpError(
            "config",
            "Usage: vard mcp add <id> -- <command> [args…]   or   vard mcp add <id> --url <url>",
          );
        const server = flags.url
          ? {
              id,
              name: flags.name ?? id,
              transport: {
                type: "http" as const,
                url: flags.url,
                auth: flags.bearer ? ("bearer" as const) : ("none" as const),
              },
            }
          : (() => {
              if (!rest.length)
                throw new McpError(
                  "config",
                  "Give the command after --, e.g. vard mcp add files -- npx -y @modelcontextprotocol/server-filesystem .",
                );
              return {
                id,
                name: flags.name ?? id,
                transport: {
                  type: "stdio" as const,
                  command: rest[0],
                  args: rest.slice(1),
                  env: {},
                },
              };
            })();
        await m.save(scope, server, { projectRoot: scope === "project" ? projectRoot : undefined });
        ctx.out.write(
          `${t.sage("✓")} Added ${id} (${scope}).${flags.bearer ? ` Store its token: vard mcp secret ${id} token` : ""} Try it: vard mcp test ${id}\n`,
        );
        return 0;
      }
      case "remove":
      case "rm":
        await m.remove(ref());
        ctx.out.write(`Removed ${id} and its stored secrets.\n`);
        return 0;
      case "enable":
      case "disable": {
        const r = ref();
        const cfg = m
          .configs(projectRoot)
          .find((c) => c.scope === r.scope && c.config.id === r.id)!.config;
        await m.save(
          r.scope,
          { ...cfg, enabled: sub === "enable" },
          { projectRoot: r.scope === "project" ? projectRoot : undefined, replaceId: r.id },
        );
        ctx.out.write(`${id} ${sub}d.\n`);
        return 0;
      }
      case "test": {
        ctx.spinner.start(`Connecting to ${id}…`);
        const r = await m.test(ref());
        ctx.spinner.stop();
        if (r.ok)
          ctx.out.write(
            `${t.sage("✓")} ${r.serverInfo?.name ?? id} ${r.serverInfo?.version ?? ""} · protocol ${r.protocolVersion ?? "?"} · ${r.tools} tools, ${r.resources} resources, ${r.prompts} prompts\n`,
          );
        else ctx.out.write(`${t.danger("✗")} ${r.error}\n${t.muted(r.logs.join("\n"))}\n`);
        return r.ok ? 0 : 1;
      }
      case "tools":
      case "resources":
      case "prompts": {
        const r = ref();
        ctx.spinner.start(`Connecting to ${id}…`);
        await m.connect(r);
        ctx.spinner.stop();
        if (sub === "tools")
          for (const tl of m.tools(r)) {
            const hints = [
              tl.annotations?.readOnlyHint && "read-only",
              tl.annotations?.destructiveHint && t.danger("destructive"),
              !tl.enabled && t.muted("off"),
            ]
              .filter(Boolean)
              .join(", ");
            ctx.out.write(
              `${t.bold(tl.name)} ${t.muted(tl.qualifiedName)}${hints ? ` (${hints})` : ""}\n  ${tl.description.slice(0, 200)}\n`,
            );
          }
        else if (sub === "resources")
          for (const rs of m.resources(r))
            ctx.out.write(
              `${rs.template ? t.muted("[template] ") : ""}${rs.uri}  ${t.muted(rs.name)}\n`,
            );
        else
          for (const p of m.prompts(r))
            ctx.out.write(
              `${t.bold(p.name)} ${t.muted(p.arguments.map((a) => (a.required ? a.name : `[${a.name}]`)).join(" "))}\n  ${p.description ?? ""}\n`,
            );
        return 0;
      }
      case "secret": {
        const name = rest[0];
        if (!name)
          throw new McpError(
            "config",
            "Usage: vard mcp secret <id> <NAME>   (NAME: an env var, header:<Name>, or token)",
          );
        const value =
          ctx.stdinText?.trim() || (await ctx.prompter.secret(`Value for ${name} (hidden): `));
        if (!value) throw new McpError("config", "No value entered; nothing changed.");
        m.setSecret(ref(), name, value);
        ctx.out.write(`${t.sage("✓")} Stored ${name} for ${id} in your Keychain.\n`);
        return 0;
      }
      case "trust":
      case "untrust":
        await m.setTrusted(projectRoot, sub === "trust");
        ctx.out.write(
          sub === "trust"
            ? `${t.sage("✓")} Trusted this project's MCP config (any later edit needs trust again).\n`
            : "No longer trusted.\n",
        );
        return 0;
      case "import": {
        const sources = knownImportSources(projectRoot);
        const pick =
          sources.find((s) => s.label.toLowerCase().startsWith(String(id ?? "").toLowerCase())) ??
          (id ? { label: id, file: id } : undefined);
        if (!pick) {
          ctx.out.write(
            sources.length
              ? `Found: ${sources.map((s) => s.label).join(", ")}. Run: vard mcp import <name>\n`
              : "No other MCP client configs found.\n",
          );
          return 0;
        }
        const added = m.importFrom(scope, { file: pick.file }, projectRoot);
        ctx.out.write(
          `${t.sage("✓")} Imported ${added.length} server(s) from ${pick.label}: ${added.join(", ")}. They're disabled; review, then vard mcp enable <id>.\n`,
        );
        return 0;
      }
      case "permissions":
      case "revoke": {
        const policy = new Policy({ projectRoot, workRoot: projectRoot });
        if (sub === "revoke") policy.revokeMcp(id ?? "");
        else if (id === "allow" || id === "deny") policy.setMcpRule(rest[0], id);
        else if (id === "reset") policy.setMcpRule(rest[0], null);
        const rules = Object.entries(policy.mcpRules());
        if (!rules.length)
          ctx.out.write(t.muted("No MCP permissions saved for this project; every call asks.\n"));
        for (const [k, v] of rules)
          ctx.out.write(`${v === "allow" ? t.sage("allow") : t.danger("deny ")} ${k}\n`);
        return 0;
      }
      default:
        ctx.err.write(
          "Usage: vard mcp [list | add | remove | enable | disable | test | tools | resources | prompts | secret | trust | import | permissions | revoke]\n",
        );
        return 1;
    }
  } catch (e) {
    ctx.spinner.stop();
    ctx.err.write(t.danger(`${(e as Error).message}\n`));
    return 1;
  } finally {
    await m.closeAll();
  }
}
