/**
 * types.ts — Shared type definitions for the QueryPilot watch system
 */

/**
 * A query event sent by the Prisma middleware (or any other ORM plugin)
 * to the QueryPilot watch server via POST /query.
 */
export interface WatchEvent {
  /** The raw SQL string Prisma actually sent to PostgreSQL */
  sql: string;
  /** Prisma model name, e.g. "User", "Post" — undefined for raw queries */
  model?: string;
  /** Prisma operation, e.g. "findMany", "create", "update" */
  operation?: string;
  /** How long the query took in the app (ms) — from Prisma's $on('query') event */
  durationMs?: number;
  /** Source tag — "prisma" | "drizzle" | "raw" | custom label */
  source?: string;
}

/**
 * The result of processing a WatchEvent — EXPLAIN plan, regression detection,
 * carbon metrics, and timing info.
 */
export interface WatchResult {
  timestamp: string;
  source: string;
  model?: string;
  operation?: string;
  /** The raw SQL (truncated for display) */
  sql: string;
  /** How long the query took in the app (ms), as reported by the middleware */
  appDurationMs?: number;
  /** PostgreSQL planner's estimated total cost */
  planCost: number;
  /** Top-level plan node type, e.g. "Index Scan", "Seq Scan", "Hash Join" */
  nodeType: string;
  /** The baseline cost we're comparing against (undefined = first time seen) */
  baseline?: number;
  /** Whether cost increased beyond the regression threshold (default: 20%) */
  regression: boolean;
  /** Percentage cost change vs baseline (positive = worse, negative = better) */
  pctChange: number;
  /** Carbon footprint in gCO₂e per 10k executions (null if plan failed) */
  co2Grams: number | null;
  /** Energy consumption in kWh per 10k executions */
  energyKwh: number | null;
  /** How long QueryPilot took to run EXPLAIN and analyze (ms) */
  analysisMs: number;
  /** Error message if EXPLAIN failed */
  error?: string;
}
