/**
 * benchmark.ts — `qp benchmark <file> [--runs N]`
 *
 * Runs a SQL query N times, measures wall-clock latency per run, then computes
 * and prints a statistics summary: min, max, mean, p50, p95, p99.
 *
 * Teaching note — why multiple runs?
 *   The first run is often slower because:
 *   - The OS disk cache is cold (data not yet in memory)
 *   - The Postgres planner caches the plan after first execution
 *   Running many times and taking the median (p50) removes this warm-up noise
 *   and gives you a more stable, realistic number.
 *
 * Teaching note — percentiles:
 *   p50 = median — half of runs were faster than this
 *   p95 = 95th percentile — 95% of runs were faster; this is the "slow tail"
 *   p99 = 99th percentile — important for real user experience at scale
 */

import { readFile } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import { pool } from "../db/connection.js";

export interface BenchmarkOptions {
  runs?: number;
}

export interface BenchmarkResult {
  runs: number;
  timingsMs: number[];
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

// ── percentile helper ──────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

// ── core logic ─────────────────────────────────────────────────────────────

export async function runBenchmark(
  sql: string,
  runs = 10,
): Promise<BenchmarkResult> {
  const trimmed = sql.trim().replace(/;+$/, "");

  if (!trimmed) throw new Error("SQL query is empty");
  if (!/^SELECT\b/i.test(trimmed)) {
    throw new Error("Only SELECT queries are supported for now");
  }
  if (trimmed.includes(";")) {
    throw new Error("Only one SQL statement is allowed");
  }

  const timingsMs: number[] = [];

  for (let i = 0; i < runs; i++) {
    const start = performance.now(); // Node.js high-resolution timer
    await pool.query(trimmed);
    const end = performance.now();
    timingsMs.push(end - start);
  }

  const sorted = [...timingsMs].sort((a, b) => a - b);

  return {
    runs,
    timingsMs,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    mean: timingsMs.reduce((a, b) => a + b, 0) / timingsMs.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

// ── CLI action ─────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  if (ms < 1) return chalk.green(`${ms.toFixed(3)} ms`);
  if (ms < 10) return chalk.yellow(`${ms.toFixed(2)} ms`);
  if (ms < 100) return chalk.yellow(`${ms.toFixed(1)} ms`);
  return chalk.red(`${ms.toFixed(1)} ms`);
}

export async function benchmarkQuery(file: string, opts: BenchmarkOptions) {
  const runs = opts.runs ?? 10;
  const spinner = ora(
    `Benchmarking ${chalk.bold(file)} × ${runs} runs`,
  ).start();

  try {
    const sql = await readFile(file, "utf8");
    const result = await runBenchmark(sql, runs);
    spinner.succeed(`Ran ${result.runs} queries`);

    // ── Print stats table ──────────────────────────────────────────────
    const col = (label: string, value: string) =>
      `  ${chalk.dim(label.padEnd(8))}${value}`;

    console.log("\n" + chalk.bold.underline("Benchmark Results"));
    console.log(chalk.dim("─".repeat(40)));
    console.log(col("runs", chalk.white(String(result.runs))));
    console.log(col("min", formatMs(result.min)));
    console.log(col("mean", formatMs(result.mean)));
    console.log(col("p50", formatMs(result.p50)));
    console.log(col("p95", formatMs(result.p95)));
    console.log(col("p99", formatMs(result.p99)));
    console.log(col("max", formatMs(result.max)));

    // ── Individual run timings (compact) ──────────────────────────────
    console.log("\n" + chalk.dim("Individual runs (ms):"));
    const compact = result.timingsMs
      .map((t, i) => chalk.dim(`  #${i + 1} `) + formatMs(t))
      .join("\n");
    console.log(compact);
    console.log("");
  } catch (error) {
    spinner.fail("Benchmark failed");
    console.error(
      chalk.red(error instanceof Error ? error.message : String(error)),
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
