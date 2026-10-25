import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const fixture = fileURLToPath(new URL("../packages/mcp-apps/test/fixtures/server.mjs", import.meta.url));

test("MCP Apps adapter exposes a complete tool and self-contained resource", async () => {
  const client = new Client({ name: "iui-test-client", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fixture],
    stderr: "pipe",
  });

  try {
    await client.connect(transport);

    const { tools } = await client.listTools();
    const tool = tools.find((item) => item.name === "render_iui");
    assert.ok(tool, "render_iui is registered");
    assert.match(tool.description ?? "", /Block catalog/);
    assert.equal(tool._meta?.ui?.resourceUri, "ui://intelligent-ui/app.html");

    const result = await client.callTool({
      name: "render_iui",
      arguments: {
        ops: [
          { t: "p", lvl: 2 },
          { t: "md", v: "Hello" },
          { t: "comp", id: "c1", type: "dayList", props: {} },
          { t: "ask", v: ["Next"] },
          { t: "done" },
        ],
      },
    });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /Hello/);
    assert.equal(result.structuredContent.ops.length, 5);
    assert.equal(result.structuredContent.ops[2].type, "dayList");

    const resource = await client.readResource({ uri: "ui://intelligent-ui/app.html" });
    const html = resource.contents[0].text;
    assert.match(html, /<div id="root"><\/div>/);
    assert.doesNotMatch(html, /<script[^>]+src=/);
    assert.doesNotMatch(html, /<link[^>]+href=/);
    assert.match(html, /createIuiHost|iui-root/);

    const { resources } = await client.listResources();
    const listed = resources.find((item) => item.uri === "ui://intelligent-ui/app.html");
    assert.ok(listed, "the IUI resource is discoverable via resources/list");
    assert.equal(listed.mimeType, "text/html;profile=mcp-app");
    assert.equal(listed._meta?.ui?.prefersBorder, false);
  } finally {
    await client.close();
  }
});
