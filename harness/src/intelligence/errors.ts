export type IntelErrorCode = "not_indexed" | "invalid" | "path" | "cancelled" | "too_large" | "embeddings";
export class IntelError extends Error {
  constructor(
    readonly code: IntelErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "IntelError";
  }
}
