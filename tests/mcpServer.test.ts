import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { app, authorized, startServer } from "../src/mcp/server.js";
import { explainQuery } from "../src/db/explain.js";

vi.mock("../src/db/explain.js", () => ({
  explainQuery: vi.fn(),
}));

describe("QueryPilot MCP Server - Cloud Run readiness & auth", () => {
  const TEST_TOKEN = "test-secret-token-1234567890";
  let server: Server | null = null;
  let serverUrl = "";

  beforeEach(() => {
    process.env.QUERY_PILOT_MCP_TOKEN = TEST_TOKEN;
    vi.mocked(explainQuery).mockReset();
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
  });

  describe("Token authorization check", () => {
    it("rejects undefined or missing authorization header", () => {
      expect(authorized(undefined)).toBe(false);
      expect(authorized("")).toBe(false);
    });

    it("rejects non-Bearer headers", () => {
      expect(authorized("Basic 12345")).toBe(false);
      expect(authorized("Token 12345")).toBe(false);
    });

    it("rejects mismatched token lengths safely", () => {
      expect(authorized("Bearer short")).toBe(false);
      expect(authorized("Bearer test-secret-token-1234567890-extra-long")).toBe(false);
    });

    it("rejects invalid Bearer token with identical length", () => {
      const invalidSameLength = "Bearer " + "x".repeat(TEST_TOKEN.length);
      expect(authorized(invalidSameLength)).toBe(false);
    });

    it("accepts exactly matching Bearer token", () => {
      expect(authorized(`Bearer ${TEST_TOKEN}`)).toBe(true);
    });

    it("rejects all tokens if QUERY_PILOT_MCP_TOKEN is unset", () => {
      delete process.env.QUERY_PILOT_MCP_TOKEN;
      expect(authorized(`Bearer ${TEST_TOKEN}`)).toBe(false);
    });
  });

  describe("HTTP endpoint security and behavior", () => {
    beforeEach(async () => {
      // Start express server on ephemeral port (port 0) for testing
      await new Promise<void>((resolve) => {
        server = app.listen(0, "127.0.0.1", () => {
          const addr = server!.address() as AddressInfo;
          serverUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    });

    it("rejects unauthenticated requests to /mcp with 401 Unauthorized", async () => {
      const response = await fetch(`${serverUrl}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(401);
      const data = (await response.json()) as { error: string };
      expect(data.error).toBe("Unauthorized");
    });

    it("rejects invalid Bearer token with 401 Unauthorized", async () => {
      const response = await fetch(`${serverUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer invalid-fake-token",
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(401);
      const data = (await response.json()) as { error: string };
      expect(data.error).toBe("Unauthorized");
    });

    it("accepts valid Bearer token and processes MCP streamable HTTP request", async () => {
      // Standard MCP client initialization payload
      const initPayload = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "test-client",
            version: "1.0.0",
          },
        },
      };

      const response = await fetch(`${serverUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
        body: JSON.stringify(initPayload),
      });

      // Streamable HTTP returns an SSE stream (200 OK) with event: message
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      const text = await response.text();
      expect(text).toContain("event: message");
      expect(text).toContain("querypilot-db");
    });
  });

  describe("Server startup & environment validation", () => {
    it("throws clear error when QUERY_PILOT_MCP_TOKEN is missing on startServer", () => {
      delete process.env.QUERY_PILOT_MCP_TOKEN;
      expect(() => startServer(0)).toThrow(
        "QUERY_PILOT_MCP_TOKEN environment variable is missing",
      );
    });

    it("starts server cleanly when token is provided and binds to expected host/port", async () => {
      process.env.QUERY_PILOT_MCP_TOKEN = TEST_TOKEN;
      const s = startServer(0, "127.0.0.1");
      await new Promise<void>((resolve) => {
        if (s.listening) {
          resolve();
        } else {
          s.on("listening", resolve);
        }
      });

      const addr = s.address() as AddressInfo;
      expect(addr.port).toBeGreaterThan(0);
      expect(addr.address).toBe("127.0.0.1");

      await new Promise<void>((resolve) => s.close(() => resolve()));
    });
  });
});
