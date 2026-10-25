/**
 * server.ts — QueryPilot Watch Server
 *
 * A lightweight HTTP server that the `qp watch` command starts locally.
 * Your app's Prisma middleware POSTs every query here in real-time.
 *
 * Flow:
 *   App sends query event → POST /query → EXPLAIN runs → regression check → terminal display
 *
 * Teaching note on why HTTP and not direct function calls:
 *   Your app (e.g. Next.js, Express) runs in its own process with its own DB connection.
 *   QueryPilot runs in a separate process. HTTP over localhost is the simplest cross-process
 *   communication with zero shared memory and zero coupling to your app's stack.
 */

import http from "http";
import { explainQuery } from "../db/explain.js";
import { calculateCarbonMetrics } from "../utils/carbon.js";
import type { WatchEvent, WatchResult } from "./types.js";

/** In-memory baseline store: queryHash → last known cost */
const baselines = new Map<string, number>();

/** Rolling query log for the terminal display (max 200 entries) */
export const queryLog: WatchResult[] = [];
const MAX_LOG = 200;

/** Subscribers to push new results to the display */
const subscribers: Array<(result: WatchResult) => void> = [];

export function subscribeToResults(cb: (result: WatchResult) => void): void {
  subscribers.push(cb);
}

/**
 * Creates a stable hash key for a query so we can track its cost over time.
 * We normalize whitespace so minor formatting differences don't split baselines.
 */
function hashQuery(sql: string): string {
  return sql
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 120); // first 120 chars is enough to identify query shape
}

/**
 * Processes a single intercepted query event:
 * 1. Runs EXPLAIN (no ANALYZE — we don't re-execute the query, just plan it)
 * 2. Compares cost to stored baseline
 * 3. Stores new baseline if none exists
 * 4. Returns a WatchResult for the terminal display
 */
async function processQuery(event: WatchEvent): Promise<WatchResult> {
  const startMs = Date.now();
  const key = hashQuery(event.sql);

  let planCost = 0;
  let nodeType = "unknown";
  let error: string | undefined;

  try {
    const plan = await explainQuery(event.sql, { analyze: false });
    planCost = (plan["Total Cost"] as number) ?? 0;
    nodeType = (plan["Node Type"] as string) ?? "unknown";
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const baseline = baselines.get(key);
  let regression = false;
  let pctChange = 0;

  if (baseline !== undefined && planCost > 0) {
    pctChange = ((planCost - baseline) / baseline) * 100;
    regression = pctChange > 20; // same threshold as qp compare
  }

  // Store or update baseline (running minimum — track the best we've seen)
  if (planCost > 0 && (baseline === undefined || planCost < baseline)) {
    baselines.set(key, planCost);
  }

  const carbon = planCost > 0 ? calculateCarbonMetrics(planCost) : null;
  const analysisMs = Date.now() - startMs;

  const result: WatchResult = {
    timestamp: new Date().toISOString(),
    source: event.source ?? "prisma",
    model: event.model,
    operation: event.operation,
    sql: event.sql,
    appDurationMs: event.durationMs,
    planCost,
    nodeType,
    baseline,
    regression,
    pctChange: Math.round(pctChange * 10) / 10,
    co2Grams: carbon?.co2Grams ?? null,
    energyKwh: carbon?.energyKwh ?? null,
    analysisMs,
    error,
  };

  // Add to rolling log
  queryLog.unshift(result);
  if (queryLog.length > MAX_LOG) queryLog.pop();

  // Notify display subscribers
  for (const cb of subscribers) cb(result);

  return result;
}

/**
 * Starts the QueryPilot watch server on the given port.
 * Returns a cleanup function to shut down the server.
 *
 * Endpoints:
 *   POST /query   — receive a query event from the middleware
 *   GET  /health  — liveness probe
 *   GET  /log     — return recent query log as JSON
 */
export function startWatchServer(port: number): Promise<() => Promise<void>> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      // CORS headers so browser-side tools can also call this in future
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", queries: queryLog.length }));
        return;
      }

      if (req.method === "GET" && req.url === "/log") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(queryLog));
        return;
      }

      if (req.method === "POST" && req.url === "/query") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          try {
            const event: WatchEvent = JSON.parse(body);
            const result = await processQuery(event);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result));
          } catch (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
            );
          }
        });
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      resolve(async () => {
        await new Promise<void>((r) => server.close(() => r()));
      });
    });
  });
}
