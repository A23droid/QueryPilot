import { pool } from "./connection.js";

export async function explainQuery(sql: string) {
  const trimmed = sql.trim().replace(/;+$/, "");

  if (!trimmed) {
    throw new Error("SQL query is empty");
  }

  // Only allow a single SELECT statement in this first version.
  if (!/^SELECT\b/i.test(trimmed)) {
    throw new Error("Only SELECT queries are supported for now");
  }

  if (trimmed.includes(";")) {
    throw new Error("Only one SQL statement is allowed");
  }

  const result = await pool.query(
    `EXPLAIN (FORMAT JSON) ${trimmed}`,
  );

  return result.rows[0]["QUERY PLAN"][0];
}
