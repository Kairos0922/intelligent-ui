#!/usr/bin/env node
/**
 * Minimal stdio MCP server with Intelligent UI enabled.
 *
 *   npm run example:mcp
 *
 * Then add it to an MCP Apps host or MCP Inspector:
 *
 *   npx @modelcontextprotocol/inspector node examples/mcp-server.mjs
 */
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createIuiServer } from "@intelligent-ui/mcp-apps";

const server = createIuiServer({
  name: "intelligent-ui-example",
  version: "0.2.2",
});

await server.connect(new StdioServerTransport());
