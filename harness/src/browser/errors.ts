export type BrowserErrorCode =
  | "not_installed"
  | "launch"
  | "crashed"
  | "timeout"
  | "blocked"
  | "sensitive"
  | "not_found"
  | "closed"
  | "install";
export class BrowserError extends Error {
  constructor(
    readonly code: BrowserErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BrowserError";
  }
}
