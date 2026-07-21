import { auth, defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import whoamiTool from "./tools/whoami";

// The OAuth issuer must be the direct Supabase host; the runtime SUPABASE_URL
// becomes a `.lovable.cloud` proxy on publish and mcp-js rejects that (RFC 8414
// issuer mismatch). Only the project ref survives publish unchanged. Vite inlines
// the VITE_* literal at build time; the fallback keeps the issuer well-formed
// during throwaway manifest-extract evals — a token never verifies against it.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "vard-ai-mcp",
  title: "Vard AI",
  version: "0.1.0",
  instructions:
    "Tools for the Vard AI personal assistant. Use `whoami` to confirm which Vard AI user this connection acts as, and `echo` to verify connectivity.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [echoTool, whoamiTool],
});