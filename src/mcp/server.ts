/**
 * server.ts — QueryPilot Model Context Protocol (MCP) Server
 *
 * Implements the official Model Context Protocol (v1) Streamable HTTP transport:
 * - Listens on port 3333 (configured via MCP_PORT)
 * - Authenticates requests via constant-time Bearer token check
 * - Registers database tools:
 *     • explain_query: Inspects PostgreSQL execution plan via JSON format
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

export function sanitizeSecretText(input: unknown): string {
  const text = input instanceof Error ? input.message : String(input);
  return text
    .replace(/:\/\/([^:]+):([^@]+)@/g, "://$1:***@")
    .replace(/Bearer\s+[A-Za-z0-9_\-\.~]+/gi, "Bearer ***")
    .replace(/ak_(?:live|claw|test)_[A-Za-z0-9]+/gi, "ak_***");
}

export function authorized(header: string | undefined): boolean {
  const expectedToken = process.env.QUERY_PILOT_MCP_TOKEN;
  if (!expectedToken || !header || !header.startsWith("Bearer ")) return false;

  const token = header.slice(7);
  const supplied = Buffer.from(token);
  const expected = Buffer.from(expectedToken);

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
        const rawMessage =
          error instanceof Error
            ? error.message
            : "Query analysis failed";
        const sanitized = sanitizeSecretText(rawMessage);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: sanitized,
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
    console.error("MCP request failed:", sanitizeSecretText(error));

    if (!res.headersSent) {
      res.status(500).json({ error: "MCP request failed" });
    }
  }
});

export function startServer(customPort?: number, customHost?: string) {
  const port = customPort ?? Number(process.env.PORT || process.env.MCP_PORT || 8080);
  const host = customHost ?? process.env.HOST ?? "0.0.0.0";

  if (!process.env.QUERY_PILOT_MCP_TOKEN) {
    throw new Error("QUERY_PILOT_MCP_TOKEN environment variable is missing");
  }

  const server = app.listen(port, host, () => {
    console.log(`QueryPilot MCP server listening on ${host}:${port}`);
  });

  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return server;
}

export { app };

if (process.env.NODE_ENV !== "test") {
  startServer();
}
