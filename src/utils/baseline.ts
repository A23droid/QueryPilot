/**
 * baseline.ts
 *
 * Read and write "baseline" snapshots of query plans.
 *
 * Teaching note:
 *   A baseline is just a saved JSON file that records what the plan looked like
 *   at a known-good point in time (usually the main branch). When a PR changes a
 *   query, we compare the new plan against the baseline to detect regressions.
 *
 *   The baseline file lives next to the SQL file with a `.baseline.json` extension,
 *   e.g.:  queries/report.sql  →  queries/report.baseline.json
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { PlanNode } from "./planPrinter.js";

// ── types ──────────────────────────────────────────────────────────────────

export interface BaselineSnapshot {
  /** ISO timestamp when the snapshot was taken */
  capturedAt: string;
  /** Git commit hash or branch name — informational only */
  ref?: string | undefined;
  /** The top-level plan node from EXPLAIN (FORMAT JSON) */
  plan: PlanNode;
  /** Estimated total cost of the root plan node */
  totalCost: number;
  /** Median benchmark duration (ms), if benchmark was run */
  medianMs?: number | undefined;
}

// ── path helpers ───────────────────────────────────────────────────────────

/** Derive the baseline file path from the SQL file path. */
export function baselinePath(sqlFile: string): string {
  const dir = path.dirname(sqlFile);
  const base = path.basename(sqlFile, path.extname(sqlFile));
  return path.join(dir, `${base}.baseline.json`);
}

// ── I/O ────────────────────────────────────────────────────────────────────

/** Save a plan snapshot as the new baseline. */
export async function saveBaseline(
  sqlFile: string,
  plan: PlanNode,
  ref?: string,
  medianMs?: number,
): Promise<string> {
  const snapshot: BaselineSnapshot = {
    capturedAt: new Date().toISOString(),
    ref,
    plan,
    totalCost: plan["Total Cost"] ?? 0,
    medianMs,
  };

  const dest = baselinePath(sqlFile);
  await writeFile(dest, JSON.stringify(snapshot, null, 2), "utf8");
  return dest;
}

/** Load an existing baseline snapshot. Returns null if none exists. */
export async function loadBaseline(
  sqlFile: string,
): Promise<BaselineSnapshot | null> {
  const p = baselinePath(sqlFile);
  if (!existsSync(p)) return null;

  const raw = await readFile(p, "utf8");
  return JSON.parse(raw) as BaselineSnapshot;
}

// ── diff helpers ───────────────────────────────────────────────────────────

export interface CostDiff {
  baseline: number;
  current: number;
  /** Positive = regression, negative = improvement */
  delta: number;
  pctChange: number;
}

export function diffCost(baseline: BaselineSnapshot, currentPlan: PlanNode): CostDiff {
  const baselineCost = baseline.totalCost;
  const currentCost = currentPlan["Total Cost"] ?? 0;
  const delta = currentCost - baselineCost;
  const pctChange = baselineCost === 0 ? 0 : (delta / baselineCost) * 100;
  return { baseline: baselineCost, current: currentCost, delta, pctChange };
}
