/**
 * MCP prompts are for the user: the UI lists them, collects arguments, and inserts the rendered
 * text into a chat or a task. The agent never pulls prompts by itself.
 */
import type { McpConnection } from "./client";
import { McpError } from "./errors";
import { cleanText } from "./security";

/** Renders a prompt's messages to plain text (non-text parts are described). */
export async function renderPrompt(
  conn: McpConnection,
  name: string,
  args: Record<string, string>,
): Promise<{ description?: string; text: string }> {
  const info = conn.prompts.find((p) => p.name === name);
  if (!info) throw new McpError("protocol", `${conn.config.name} has no prompt "${name}".`);
  for (const a of info.arguments)
    if (a.required && !args[a.name]?.trim())
      throw new McpError("config", `The prompt needs "${a.name}".`);
  const r = await conn.getPrompt(name, args);
  const text = (r.messages ?? [])
    .map((m) => {
      const c = m.content as {
        type: string;
        text?: string;
        resource?: { uri?: string; text?: string };
      };
      const body =
        c.type === "text"
          ? (c.text ?? "")
          : c.type === "resource"
            ? (c.resource?.text ?? `[resource ${c.resource?.uri ?? ""}]`)
            : `[${c.type} content]`;
      return r.messages.length > 1
        ? `${m.role === "assistant" ? "Assistant" : "User"}: ${body}`
        : body;
    })
    .join("\n\n");
  return {
    description: r.description ? cleanText(r.description, 500) : undefined,
    text: cleanText(text, 20_000),
  };
}
