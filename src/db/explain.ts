/**
 * explain.ts
 *
 * Wrapper around PostgreSQL's EXPLAIN command.
 *
 * Teaching note:
 *   EXPLAIN shows the *planner's estimate* of how it will execute a query.
 *   EXPLAIN ANALYZE actually runs the query and shows measured timings.
 *   We support both modes via the `analyze` flag.
 *   FORMAT JSON is used because it's much easier to parse programmatically
 *   than the default text format.
 */

import { pool } from "./connection.js";
import type { PlanNode } from "../utils/planPrinter.js";

export interface ExplainOptions {
  /**
   * If true, runs EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) which:
   *   - Actually executes the query
   *   - Returns real timing and buffer hit/miss statistics
   * WARNING: This runs the query for real, so avoid on write queries.
   */
  analyze?: boolean;
}

/**
 * Run EXPLAIN against the given SQL and return the parsed plan node.
 */
export async function explainQuery(
  sql: string,
  opts: ExplainOptions = {},
): Promise<PlanNode> {
  const trimmed = sql.trim().replace(/;+$/, "");

  if (!trimmed) {
    throw new Error("SQL query is empty");
  }

  // Strip SQL comments before checking the statement type.
  // Teaching note: SQL supports two comment styles:
  //   -- single line comment
  //   /* multi-line block comment */
  // We strip them so a file like slow.sql (which has --comments at the top)
  // still passes the SELECT check even though it doesn't start with SELECT.
  const withoutComments = trimmed
    .replace(/\/\*[\s\S]*?\*\//g, "") // /* block comments */
    .replace(/--[^\r\n]*/g, "")        // -- line comments
    .trim();

  if (withoutComments.includes(";")) {
    throw new Error("Only one SQL statement is allowed");
  }

  const explainClause = opts.analyze
    ? "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)"
    : "EXPLAIN (FORMAT JSON)";

  const result = await pool.query(`${explainClause} ${trimmed}`);

  // PostgreSQL EXPLAIN FORMAT JSON returns:
  //   [{ "QUERY PLAN": [ { "Plan": { "Node Type": ..., "Plans": [...] } } ] }]
  // Teaching note: the actual plan node is nested one level deeper inside
  // a "Plan" key. Without this, node["Node Type"] is undefined and crashes.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return result.rows[0]["QUERY PLAN"][0]["Plan"] as PlanNode;
}
