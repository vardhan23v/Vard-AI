import { z } from "zod";
import { truncateHead } from "../util";
import type { Todo, ToolDef } from "./types";

const TodoSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
  status: z.enum(["pending", "in_progress", "completed"]),
});

export function renderTodos(todos: Todo[]): string {
  if (!todos.length) return "(no todos)";
  const mark = { pending: "[ ]", in_progress: "[~]", completed: "[x]" } as const;
  return todos.map((t) => `${mark[t.status]} ${t.id}. ${t.content}`).join("\n");
}

export const todoWrite: ToolDef<{ todos: Todo[] }> = {
  name: "todo_write",
  description:
    "Replace the visible task checklist. Send the whole list every time. Keep exactly one item in_progress while working.",
  inputSchema: z.object({ todos: z.array(TodoSchema).max(50) }),
  risk: "read",
  maxOutput: 4_000,
  truncate(s) {
    return truncateHead(s, this.maxOutput);
  },
  async execute({ todos }, ctx) {
    ctx.setTodos(todos);
    return renderTodos(todos);
  },
};
