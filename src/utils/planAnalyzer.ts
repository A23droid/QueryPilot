/**
 * planAnalyzer.ts
 *
 * Walks an EXPLAIN JSON plan tree and identifies common performance anti-patterns.
 * For each finding it produces a human-readable suggestion.
 *
 * Teaching note:
 *   This is a static analysis pass — we look at the planner's *estimated* plan
 *   to find warning signs. We don't need to run the query to do this.
 *   Real performance tools (like pg_stat_statements) do runtime analysis instead,
 *   but catching issues at plan-time is much faster for CI.
 */

import type { PlanNode } from "./planPrinter.js";

// ── types ──────────────────────────────────────────────────────────────────

export type Severity = "critical" | "warning" | "info";

export interface Finding {
  severity: Severity;
  message: string;
  suggestion: string;
  /** The node-type that triggered this finding */
  nodeType: string;
  /** Table name, if applicable */
  relation?: string | undefined;
}

// ── detection rules ────────────────────────────────────────────────────────

/** Threshold: Seq Scan is suspicious above this estimated row count */
const SEQ_SCAN_ROW_THRESHOLD = 1_000;

/** Threshold: Any node with plan cost above this gets flagged */
const HIGH_COST_THRESHOLD = 10_000;

function detectNode(node: PlanNode, findings: Finding[]): void {
  const type = node["Node Type"] ?? "";
  const rows = node["Plan Rows"] ?? 0;
  const cost = node["Total Cost"] ?? 0;
  const relation = node["Relation Name"];

  // ── Rule 1: Seq Scan on a large table ─────────────────────────────────
  if (type === "Seq Scan" && rows > SEQ_SCAN_ROW_THRESHOLD) {
    findings.push({
      severity: "critical",
      nodeType: type,
      relation,
      message: `Sequential scan on '${relation ?? "unknown"}' estimated ${rows.toLocaleString("en-US")} rows`,
      suggestion: relation
        ? `Consider: CREATE INDEX ON ${relation} (<filtered_column>);\nOr use a covering index if you SELECT few columns.`
        : "Add an index on the column(s) in your WHERE clause.",
    });
  }

  // ── Rule 2: Seq Scan on any table (even small) ────────────────────────
  if (type === "Seq Scan" && rows <= SEQ_SCAN_ROW_THRESHOLD) {
    findings.push({
      severity: "info",
      nodeType: type,
      relation,
      message: `Sequential scan on '${relation ?? "unknown"}' (${rows} rows — acceptable for small tables)`,
      suggestion:
        "Monitor this table's growth. Add an index before it reaches production scale.",
    });
  }

  // ── Rule 3: High total cost node ──────────────────────────────────────
  if (cost > HIGH_COST_THRESHOLD) {
    findings.push({
      severity: "warning",
      nodeType: type,
      relation,
      message: `Node '${type}' has high estimated cost (${cost.toFixed(0)})`,
      suggestion:
        "Run EXPLAIN ANALYZE to compare estimated vs actual rows. Large discrepancies indicate stale statistics — run ANALYZE on the table.",
    });
  }

  // ── Rule 4: Sort without index ────────────────────────────────────────
  if (type === "Sort") {
    findings.push({
      severity: "warning",
      nodeType: type,
      message: "In-memory Sort step detected",
      suggestion:
        "If you ORDER BY a column frequently, create an index on that column so Postgres can skip the sort step entirely.",
    });
  }

  // ── Rule 5: Nested Loop join with Seq Scan inside ─────────────────────
  if (type === "Nested Loop") {
    const hasSeqChild = (node.Plans ?? []).some(
      (p) => p["Node Type"] === "Seq Scan",
    );
    if (hasSeqChild) {
      findings.push({
        severity: "critical",
        nodeType: type,
        message: "Nested Loop join driving a Seq Scan on the inner side",
        suggestion:
          "This is O(n²). Add an index on the join column of the inner table to switch to an Index Scan.",
      });
    }
  }

  // ── Rule 6: Hash Join — check for large hash build ────────────────────
  if (type === "Hash") {
    const hashRows = node["Plan Rows"] ?? 0;
    if (hashRows > 50_000) {
      findings.push({
        severity: "warning",
        nodeType: type,
        message: `Hash build step materialises ~${hashRows.toLocaleString("en-US")} rows`,
        suggestion:
          "Large hash builds consume memory. Check work_mem setting and consider narrowing the join or adding a filter.",
      });
    }
  }

  // ── Recurse into children ─────────────────────────────────────────────
  for (const child of node.Plans ?? []) {
    detectNode(child, findings);
  }
}

/** Analyse a plan and return all findings, sorted by severity. */
export function analyzePlan(plan: PlanNode): Finding[] {
  const findings: Finding[] = [];
  detectNode(plan, findings);

  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}
