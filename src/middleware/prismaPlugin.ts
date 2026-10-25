/**
 * prismaPlugin.ts — QueryPilot Prisma Middleware
 *
 * Drop this into any TypeScript/JavaScript app that uses Prisma.
 * It intercepts every query Prisma sends to PostgreSQL and forwards it
 * to a running `qp watch` server for real-time EXPLAIN analysis.
 *
 * ─── USAGE ───────────────────────────────────────────────────────────────────
 *
 *  Step 1 — start the watch server in a terminal:
 *    $ qp watch
 *
 *  Step 2 — wrap your PrismaClient in your app (e.g. lib/db.ts):
 *
 *    import { PrismaClient } from '@prisma/client';
 *    import { attachQueryPilot } from 'querypilot/middleware/prisma';
 *
 *    export const prisma = attachQueryPilot(
 *      new PrismaClient({ log: [{ emit: 'event', level: 'query' }] })
 *    );
 *
 *  Step 3 — run your app normally. Every Prisma query will appear in the
 *    `qp watch` terminal with its EXPLAIN plan, regression delta, and CO₂e.
 *
 * ─── HOW IT WORKS ─────────────────────────────────────────────────────────
 *
 *  Prisma exposes a `$on('query', handler)` event that fires after every
 *  query completes. It gives us:
 *    - e.query     — the exact SQL string Prisma sent (with $1, $2 params)
 *    - e.params    — the bound parameter values as a JSON string
 *    - e.duration  — how long Prisma's own connection took (ms)
 *    - e.target    — the Prisma model / operation path
 *
 *  We fire-and-forget a POST to the local qp watch server.
 *  If the server isn't running, we silently swallow the error so your
 *  app is never affected.
 *
 * ─── OVERHEAD NOTE ────────────────────────────────────────────────────────
 *
 *  The `$on('query')` listener fires AFTER the query already completed.
 *  The HTTP POST to localhost is asynchronous and non-blocking — it does NOT
 *  add latency to your app's response time. The only risk is a tiny burst
 *  of background CPU if many queries fire simultaneously.
 *
 *  The watch server itself runs EXPLAIN (not EXPLAIN ANALYZE), which only
 *  asks the query planner to estimate — it does NOT re-run your query.
 *
 *  Bottom line: ZERO latency added to your app in the hot path.
 *  Use only in development / staging — never in production.
 *
 * ─── PYTHON / DRIZZLE / TYPEORM ───────────────────────────────────────────
 *
 *  Any ORM or language can integrate by POSTing to http://127.0.0.1:7432/query
 *  with the following JSON body:
 *
 *    {
 *      "sql":        "SELECT * FROM ...",   // required
 *      "model":      "User",                // optional
 *      "operation":  "findMany",            // optional
 *      "durationMs": 12.3,                  // optional — from your ORM's timing
 *      "source":     "drizzle"              // optional label
 *    }
 */

/** Options for the QueryPilot middleware */
export interface QueryPilotOptions {
  /**
   * Host and port of the running `qp watch` server.
   * Default: "http://127.0.0.1:7432"
   */
  serverUrl?: string;
  /**
   * Only forward queries that take longer than this threshold (ms).
   * Useful to reduce noise from trivial fast queries.
   * Default: 0 (forward everything)
   */
  minDurationMs?: number;
  /**
   * Called when a regression is detected by the watch server.
   * Use this to log to your app's own logger or trigger alerts.
   */
  onRegression?: (info: {
    sql: string;
    model?: string;
    operation?: string;
    pctChange: number;
    planCost: number;
    baseline: number;
  }) => void;
}

/**
 * Attaches the QueryPilot listener to an existing PrismaClient instance.
 *
 * IMPORTANT: Your PrismaClient must be instantiated with:
 *   new PrismaClient({ log: [{ emit: 'event', level: 'query' }] })
 *
 * Without that, Prisma doesn't emit the query events we hook into.
 *
 * @returns The same PrismaClient instance (for chaining/convenience)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function attachQueryPilot<T extends { $on: (event: string, handler: (e: any) => void) => void }>(
  prisma: T,
  options: QueryPilotOptions = {},
): T {
  const serverUrl = options.serverUrl ?? "http://127.0.0.1:7432";
  const minDurationMs = options.minDurationMs ?? 0;

  prisma.$on("query", (e: {
    query: string;
    params: string;
    duration: number;
    target: string;
  }) => {
    // Skip if faster than threshold (e.g. you only care about slow queries)
    if (e.duration < minDurationMs) return;

    // Parse the target: Prisma formats it as "prisma:query" or "User.findMany"
    const [model, operation] = parseTarget(e.target);

    // Build the payload
    const payload = JSON.stringify({
      sql: e.query,
      model,
      operation,
      durationMs: e.duration,
      source: "prisma",
    });

    // Fire-and-forget — never block the app
    void sendToWatchServer(serverUrl, payload, options.onRegression);
  });

  return prisma;
}

/** Parse Prisma's target string into [model, operation] */
function parseTarget(target: string): [string | undefined, string | undefined] {
  if (!target) return [undefined, undefined];
  // Prisma formats: "prisma:query" for raw, or "Model.operation" in middleware
  const parts = target.split(".");
  if (parts.length === 2) return [parts[0], parts[1]];
  return [undefined, target];
}

/** Sends a query event to the watch server, swallowing any errors */
async function sendToWatchServer(
  serverUrl: string,
  payload: string,
  onRegression?: QueryPilotOptions["onRegression"],
): Promise<void> {
  try {
    const res = await fetch(`${serverUrl}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      signal: AbortSignal.timeout(2000), // don't hang if server is down
    });

    if (res.ok && onRegression) {
      const result = await res.json() as {
        regression: boolean;
        sql: string;
        model?: string;
        operation?: string;
        pctChange: number;
        planCost: number;
        baseline?: number;
      };
      if (result.regression && result.baseline !== undefined) {
        onRegression({
          sql: result.sql,
          model: result.model,
          operation: result.operation,
          pctChange: result.pctChange,
          planCost: result.planCost,
          baseline: result.baseline,
        });
      }
    }
  } catch {
    // Server not running — silently ignore. Never crash the app.
  }
}
