/** Skills that ship with Vard (harness/skills/<name>/SKILL.md), embedded in the binary as text. */
import accessibility from "../../skills/accessibility/SKILL.md" with { type: "text" };
import backendApi from "../../skills/backend-api/SKILL.md" with { type: "text" };
import browserAutomation from "../../skills/browser-automation/SKILL.md" with { type: "text" };
import changeImpactAnalysis from "../../skills/change-impact-analysis/SKILL.md" with { type: "text" };
import codeReview from "../../skills/code-review/SKILL.md" with { type: "text" };
import codebaseExploration from "../../skills/codebase-exploration/SKILL.md" with { type: "text" };
import databaseDesign from "../../skills/database-design/SKILL.md" with { type: "text" };
import debugging from "../../skills/debugging/SKILL.md" with { type: "text" };
import dependencyAnalysis from "../../skills/dependency-analysis/SKILL.md" with { type: "text" };
import deployment from "../../skills/deployment/SKILL.md" with { type: "text" };
import documentation from "../../skills/documentation/SKILL.md" with { type: "text" };
import mcpServerDevelopment from "../../skills/mcp-server-development/SKILL.md" with { type: "text" };
import nextjsDevelopment from "../../skills/nextjs-development/SKILL.md" with { type: "text" };
import playwrightTesting from "../../skills/playwright-testing/SKILL.md" with { type: "text" };
import reactDevelopment from "../../skills/react-development/SKILL.md" with { type: "text" };
import responsiveUiTesting from "../../skills/responsive-ui-testing/SKILL.md" with { type: "text" };
import securityAudit from "../../skills/security-audit/SKILL.md" with { type: "text" };
import semanticCodeSearch from "../../skills/semantic-code-search/SKILL.md" with { type: "text" };
import testingStrategy from "../../skills/testing-strategy/SKILL.md" with { type: "text" };
import visualRegressionTesting from "../../skills/visual-regression-testing/SKILL.md" with { type: "text" };

export const BUILTIN_SKILLS: Record<string, string> = {
  "accessibility": accessibility,
  "backend-api": backendApi,
  "browser-automation": browserAutomation,
  "change-impact-analysis": changeImpactAnalysis,
  "code-review": codeReview,
  "codebase-exploration": codebaseExploration,
  "database-design": databaseDesign,
  "debugging": debugging,
  "dependency-analysis": dependencyAnalysis,
  "deployment": deployment,
  "documentation": documentation,
  "mcp-server-development": mcpServerDevelopment,
  "nextjs-development": nextjsDevelopment,
  "playwright-testing": playwrightTesting,
  "react-development": reactDevelopment,
  "responsive-ui-testing": responsiveUiTesting,
  "security-audit": securityAudit,
  "semantic-code-search": semanticCodeSearch,
  "testing-strategy": testingStrategy,
  "visual-regression-testing": visualRegressionTesting,
};
