export type SkillErrorCode =
  | "invalid"
  | "not_found"
  | "untrusted"
  | "shadowed"
  | "disabled"
  | "path"
  | "too_large"
  | "exists";

export class SkillError extends Error {
  constructor(
    readonly code: SkillErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SkillError";
  }
}
