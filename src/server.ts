import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const kServer = Symbol.for("mcp.server");
const g = globalThis as Record<string | symbol, unknown>;

export const server = (g[kServer] ??= new McpServer({
  name: "mcp-db-server",
  version: "1.0.0",
})) as McpServer;
