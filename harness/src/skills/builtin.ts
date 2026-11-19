/** Skills that ship with Vard (harness/skills/<name>/SKILL.md), embedded in the binary as text. */
import accessibility from "../../skills/accessibility/SKILL.md" with { type: "text" };
import backendApi from "../../skills/backend-api/SKILL.md" with { type: "text" };
import codeReview from "../../skills/code-review/SKILL.md" with { type: "text" };
import databaseDesign from "../../skills/database-design/SKILL.md" with { type: "text" };
import debugging from "../../skills/debugging/SKILL.md" with { type: "text" };
import deployment from "../../skills/deployment/SKILL.md" with { type: "text" };
import documentation from "../../skills/documentation/SKILL.md" with { type: "text" };
import mcpServerDevelopment from "../../skills/mcp-server-development/SKILL.md" with { type: "text" };
import nextjsDevelopment from "../../skills/nextjs-development/SKILL.md" with { type: "text" };
import reactDevelopment from "../../skills/react-development/SKILL.md" with { type: "text" };
import securityAudit from "../../skills/security-audit/SKILL.md" with { type: "text" };
import testingStrategy from "../../skills/testing-strategy/SKILL.md" with { type: "text" };

export const BUILTIN_SKILLS: Record<string, string> = {
  "accessibility": accessibility,
  "backend-api": backendApi,
  "code-review": codeReview,
  "database-design": databaseDesign,
  "debugging": debugging,
  "deployment": deployment,
  "documentation": documentation,
  "mcp-server-development": mcpServerDevelopment,
  "nextjs-development": nextjsDevelopment,
  "react-development": reactDevelopment,
  "security-audit": securityAudit,
  "testing-strategy": testingStrategy,
};
