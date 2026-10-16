/**
 * planPrinter.ts
 *
 * Takes the JSON object returned by EXPLAIN (FORMAT JSON) and renders it
 * as a coloured, indented tree that is easy to read in the terminal.
 *
 * Teaching note:
 *   PostgreSQL EXPLAIN JSON returns a nested structure. Each node has a
 *   "Node Type" (e.g. "Seq Scan", "Index Scan", "Hash Join") and optional
 *   child "Plans" array. We walk the tree recursively and print each level
 *   with an extra two-space indent.
 */

import chalk from "chalk";

// ── types ──────────────────────────────────────────────────────────────────

export interface PlanNode {
  "Node Type": string;
  "Total Cost"?: number;
  "Plan Rows"?: number;
  "Actual Total Time"?: number;
  "Actual Rows"?: number;
  "Relation Name"?: string;
  "Index Name"?: string;
  "Filter"?: string;
  "Index Cond"?: string;
  "Join Type"?: string;
  Plans?: PlanNode[];
  [key: string]: unknown;
}

// ── helpers ────────────────────────────────────────────────────────────────

/** Colour a node-type label based on whether it looks expensive. */
function nodeTypeColor(nodeType: string): string {
  const expensive = ["Seq Scan", "Hash", "Sort", "Materialize", "Gather"];
  const fast = ["Index Scan", "Index Only Scan", "Bitmap Index Scan"];

  if (expensive.some((t) => nodeType.includes(t))) {
    return chalk.yellow.bold(nodeType);
  }
  if (fast.some((t) => nodeType.includes(t))) {
    return chalk.green.bold(nodeType);
  }
  return chalk.cyan.bold(nodeType);
}

function fmt(n: number | undefined, decimals = 2): string {
  return n !== undefined ? n.toFixed(decimals) : "?";
}

// ── main export ─────────────────────────────────────────────────────────────

/**
 * Format a plan node (and all its children) as a plain-text string.
 * Useful for embedding reports in Markdown or CI comments.
 * @param node  The plan node object from EXPLAIN JSON
 * @param depth Recursion depth — controls indentation (start at 0)
 */
export function formatPlanNode(node: PlanNode, depth = 0): string {
  const indent = "  ".repeat(depth);
  const connector = depth === 0 ? "" : "└─ ";
  const lines: string[] = [];

  // ── Node heading ──────────────────────────────────────────────────────
  const relation = node["Relation Name"]
    ? ` on ${node["Relation Name"]}`
    : "";
  const indexHint = node["Index Name"] ? ` [${node["Index Name"]}]` : "";

  lines.push(
    `${indent}${connector}${node["Node Type"]}${relation}${indexHint}`,
  );

  // ── Cost / rows ───────────────────────────────────────────────────────
  const costLine: string[] = [
    `cost=${fmt(node["Total Cost"])}`,
    `rows=${fmt(node["Plan Rows"], 0)}`,
  ];

  if (node["Actual Total Time"] !== undefined) {
    costLine.push(`actual=${fmt(node["Actual Total Time"])} ms`);
    costLine.push(`actual_rows=${fmt(node["Actual Rows"], 0)}`);
  }

  lines.push(`${indent}   ${costLine.join("  ")}`);

  // ── Conditions / filters ──────────────────────────────────────────────
  if (node["Index Cond"]) {
    lines.push(`${indent}   index cond: ${node["Index Cond"]}`);
  }
  if (node["Filter"]) {
    lines.push(`${indent}   filter: ${node["Filter"]}`);
  }
  if (node["Join Type"]) {
    lines.push(`${indent}   join: ${node["Join Type"]}`);
  }

  // ── Recurse into children ─────────────────────────────────────────────
  if (node.Plans && node.Plans.length > 0) {
    for (const child of node.Plans) {
      lines.push(formatPlanNode(child, depth + 1));
    }
  }

  return lines.join("\n");
}

/**
 * Print a plan node (and all its children) to stdout.
 * @param node  The plan node object from EXPLAIN JSON
 * @param depth Recursion depth — controls indentation (start at 0)
 */
export function printPlanNode(node: PlanNode, depth = 0): void {
  console.log(formatPlanNode(node, depth));
}
