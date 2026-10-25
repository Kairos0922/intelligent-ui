import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createIuiServer } from "../../dist/server.js";

const server = createIuiServer({ name: "intelligent-ui-test", version: "0.0.0" });
await server.connect(new StdioServerTransport());
