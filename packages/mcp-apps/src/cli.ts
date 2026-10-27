#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createIuiServer } from "./server.js";

const server = createIuiServer({ name: "intelligent-ui", version: "0.2.2" });
await server.connect(new StdioServerTransport());
