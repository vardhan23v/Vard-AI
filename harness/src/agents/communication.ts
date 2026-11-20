/**
 * Structured messages between the orchestrator and agents. There is no free-form agent-to-agent
 * chat: agents receive their assignment and dependency results, and report back through these.
 */
import type { AgentMessage } from "./schema";

const MAX_MESSAGES = 500;

export class MessageBus {
  readonly messages: AgentMessage[] = [];
  private seq = 0;
  constructor(private onMessage: (m: AgentMessage) => void) {}

  post(kind: AgentMessage["kind"], m: Omit<AgentMessage, "seq" | "kind" | "at">): AgentMessage {
    const msg: AgentMessage = {
      ...m,
      kind,
      seq: ++this.seq,
      at: Date.now(),
      text: m.text.slice(0, 2000),
    };
    this.messages.push(msg);
    if (this.messages.length > MAX_MESSAGES)
      this.messages.splice(0, this.messages.length - MAX_MESSAGES);
    this.onMessage(msg);
    return msg;
  }
}
