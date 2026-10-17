/**
 * server.ts — QueryPilot Model Context Protocol (MCP) Server
 *
 * Implements the official Model Context Protocol (v1) Streamable HTTP transport:
 * - Listens on port 3333 (configured via MCP_PORT)
 * - Authenticates requests via constant-time Bearer token check
 * - Registers database tools:
 *     • explain_query: Inspects PostgreSQL execution plan via JSON format
 * - Registered with ArmorIQ control plane as 'querypilot-db'
 */

import "dotenv/config";
import express from "express";
import { timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { explainQuery } from "../db/explain.js";

const app = express();
app.use(express.json());

const port = Number(process.env.MCP_PORT ?? 3333);
const expectedToken = process.env.QUERY_PILOT_MCP_TOKEN;

if (!expectedToken) {
  throw new Error("QUERY_PILOT_MCP_TOKEN is missing");
}

function authorized(header: string | undefined): boolean {
  if (!header || !header.startsWith("Bearer ")) return false;

  const token = header.slice(7);
  const supplied = Buffer.from(token);
  const expected = Buffer.from(expectedToken!);

  return (
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
  );
}

app.post("/mcp", async (req, res) => {
  if (!authorized(req.headers.authorization)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const server = new McpServer({
    name: "querypilot-db",
    version: "1.0.0",
  });

  server.registerTool(
    "explain_query",
    {
      description:
        "Inspect the PostgreSQL execution plan for a read-only SQL query.",
      inputSchema: {
        sql: z.string().min(1),
      },
    },
    async ({ sql }) => {
      try {
        const plan = await explainQuery(sql);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(plan, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                error instanceof Error
                  ? error.message
                  : "Query analysis failed",
            },
          ],
        };
      }
    },
  );

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined as unknown as () => string,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport as any);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error);

    if (!res.headersSent) {
      res.status(500).json({ error: "MCP request failed" });
    }
  }
});

app.listen(port, "127.0.0.1", () => {
  console.log(`QueryPilot MCP server listening on port ${port}`);
});
