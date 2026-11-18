/**
 * MCP authorization (OAuth 2.1 with PKCE, per the MCP authorization spec) for remote servers.
 *
 * The SDK drives discovery, dynamic client registration, PKCE and token exchange; this provider
 * supplies storage (the Keychain, base64-encoded JSON) and the user-agent step: open the
 * browser, and catch the redirect on a loopback port on this Mac.
 */
import crypto from "node:crypto";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { McpError } from "./errors";
import type { SecretStore } from "./secrets";

const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64");
const dec = <T>(v: string | null): T | undefined => {
  if (!v) return undefined;
  try {
    return JSON.parse(Buffer.from(v, "base64").toString("utf8")) as T;
  } catch {
    return undefined;
  }
};

/** A stable loopback port per server, so a registered redirect URI stays valid. */
export function loopbackPort(accountBase: string): number {
  const n = crypto.createHash("sha256").update(accountBase).digest().readUInt16BE(0);
  return 47_900 + (n % 1000);
}

export class VardOAuthProvider implements OAuthClientProvider {
  private verifier = "";
  private expectedState = "";
  /** When set, the next authorization opens the browser and waits for the redirect. */
  interactive = false;
  private pending: Promise<string> | null = null;

  constructor(
    private secrets: SecretStore,
    /** Keychain account prefix for this server, e.g. "global/github". */
    private accountBase: string,
    private openBrowser: (url: string) => void = (url) =>
      void Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" }),
  ) {}

  get redirectUrl() {
    return `http://127.0.0.1:${loopbackPort(this.accountBase)}/callback`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Vard AI",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  state() {
    this.expectedState = crypto.randomBytes(16).toString("hex");
    return this.expectedState;
  }

  clientInformation() {
    return dec<OAuthClientInformationMixed>(this.secrets.get(`${this.accountBase}/oauth-client`));
  }

  saveClientInformation(info: OAuthClientInformationMixed) {
    this.secrets.set(`${this.accountBase}/oauth-client`, enc(info));
  }

  tokens() {
    return dec<OAuthTokens>(this.secrets.get(`${this.accountBase}/oauth-tokens`));
  }

  saveTokens(tokens: OAuthTokens) {
    this.secrets.set(`${this.accountBase}/oauth-tokens`, enc(tokens));
  }

  saveCodeVerifier(v: string) {
    this.verifier = v;
  }

  codeVerifier() {
    if (!this.verifier) throw new McpError("auth", "No authorization is in progress.");
    return this.verifier;
  }

  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all" || scope === "tokens")
      this.secrets.remove(`${this.accountBase}/oauth-tokens`);
    if (scope === "all" || scope === "client")
      this.secrets.remove(`${this.accountBase}/oauth-client`);
    if (scope === "all" || scope === "verifier") this.verifier = "";
  }

  /** Called by the SDK when the user must sign in. */
  redirectToAuthorization(url: URL) {
    if (!this.interactive)
      throw new McpError(
        "auth",
        "This server needs you to sign in. Use Authorize in Integrations.",
      );
    if (url.protocol !== "https:" && !/^(localhost|127\.)/.test(url.hostname))
      throw new McpError("auth", "The authorization page isn't served over https.");
    this.pending = this.waitForRedirect();
    this.openBrowser(url.toString());
  }

  /** The authorization code from the browser redirect (after redirectToAuthorization). */
  async authorizationCode(): Promise<string> {
    if (!this.pending) throw new McpError("auth", "No authorization is in progress.");
    return this.pending;
  }

  private waitForRedirect(timeoutMs = 300_000): Promise<string> {
    const port = loopbackPort(this.accountBase);
    return new Promise((resolve, reject) => {
      let server: ReturnType<typeof Bun.serve> | null = null;
      const finish = (err: Error | null, code?: string) => {
        clearTimeout(timer);
        setTimeout(() => server?.stop(true), 200);
        if (err) reject(err);
        else resolve(code!);
      };
      const timer = setTimeout(() => finish(new McpError("auth", "Sign-in timed out.")), timeoutMs);
      try {
        server = Bun.serve({
          hostname: "127.0.0.1",
          port,
          fetch: (req) => {
            const u = new URL(req.url);
            if (u.pathname !== "/callback") return new Response("Not found", { status: 404 });
            const page = (msg: string) =>
              new Response(
                `<!doctype html><meta charset="utf-8"><title>Vard AI</title><body style="font:16px system-ui;background:#1d274e;color:#e4e3d2;display:grid;place-items:center;height:100vh;margin:0"><p>${msg}</p></body>`,
                { headers: { "content-type": "text/html; charset=utf-8" } },
              );
            const code = u.searchParams.get("code");
            const state = u.searchParams.get("state");
            if (u.searchParams.get("error")) {
              finish(new McpError("auth", `Sign-in was declined: ${u.searchParams.get("error")}`));
              return page("Sign-in was cancelled. You can close this tab.");
            }
            if (!code || !state || state !== this.expectedState) {
              finish(
                new McpError("auth", "The sign-in response didn't match (state check failed)."),
              );
              return page("Something didn't match. Please try again from Vard AI.");
            }
            finish(null, code);
            return page("Signed in. You can close this tab and return to Vard AI.");
          },
        });
      } catch (e) {
        finish(
          new McpError(
            "auth",
            `Couldn't listen for the sign-in redirect on port ${port}: ${(e as Error).message}`,
          ),
        );
      }
    });
  }
}
