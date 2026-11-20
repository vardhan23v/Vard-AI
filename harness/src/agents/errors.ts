export type OrchestrationErrorCode =
  | "plan_invalid"
  | "cycle"
  | "budget"
  | "timeout"
  | "conflict"
  | "cancelled"
  | "config";

export class OrchestrationError extends Error {
  constructor(
    readonly code: OrchestrationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OrchestrationError";
  }
}
