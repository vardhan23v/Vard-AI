/** Streamable HTTP mock MCP server on 127.0.0.1 (stateless), requiring a bearer token. */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMockServer } from "./mock-server";

export function startHttpMock(token = "test-token") {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      if (new URL(req.url).pathname !== "/mcp") return new Response("not found", { status: 404 });
      if (req.headers.get("authorization") !== `Bearer ${token}`)
        return new Response("unauthorized", { status: 401 });
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      const mcp = buildMockServer("http-mock");
      await mcp.connect(transport);
      return transport.handleRequest(req);
    },
  });
  return { url: `http://127.0.0.1:${server.port}/mcp`, stop: () => server.stop(true) };
}
