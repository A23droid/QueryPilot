/**
 * display.ts — Live terminal display for qp watch
 *
 * Renders a continuously-updating terminal dashboard as queries come in.
 * Uses Chalk for colors and a simple line-rewrite strategy so the summary
 * header stays at the top while new query rows stream below.
 */

import chalk from "chalk";
import type { WatchResult } from "./types.js";

/** Stats accumulator updated as queries arrive */
interface Stats {
  total: number;
  regressions: number;
  seqScans: number;
  totalCo2: number;
}

const stats: Stats = {
  total: 0,
  regressions: 0,
  seqScans: 0,
  totalCo2: 0,
};

/** Print the static watch header once at startup */
export function printWatchHeader(port: number): void {
  console.log(
    chalk.bgCyan.black(` QueryPilot Watch `) +
      chalk.dim(` — listening on http://127.0.0.1:${port}/query`),
  );
  console.log(
    chalk.dim(
      "  Add the middleware to your app, then run queries normally. Ctrl+C to stop.\n",
    ),
  );
  console.log(
    chalk.dim(
      `  ${"Time".padEnd(9)} ${"Source".padEnd(10)} ${"Model / Operation".padEnd(26)} ${"Node Type".padEnd(16)} ${"Cost".padStart(8)} ${"Δ%".padStart(7)} ${"App ms".padStart(7)} ${"CO₂e/10k".padStart(10)}`,
    ),
  );
  console.log(chalk.dim("  " + "─".repeat(100)));
}

/** Called every time a new WatchResult comes in from the server */
export function printQueryResult(r: WatchResult): void {
  // Update accumulators
  stats.total += 1;
  if (r.regression) stats.regressions += 1;
  if (r.nodeType.toLowerCase().includes("seq scan")) stats.seqScans += 1;
  if (r.co2Grams !== null) stats.totalCo2 += r.co2Grams;

  // Time column — HH:MM:SS
  const ts = new Date(r.timestamp);
  const time = [ts.getHours(), ts.getMinutes(), ts.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");

  // Model/operation label
  const label =
    r.model && r.operation
      ? `${r.model}.${r.operation}`
      : r.model ?? r.operation ?? chalk.dim("raw");

  // Node type with color
  const nodeColored = r.nodeType.includes("Seq Scan")
    ? chalk.red(r.nodeType)
    : r.nodeType.includes("Index")
      ? chalk.green(r.nodeType)
      : chalk.yellow(r.nodeType);

  // Delta column
  let delta = "  new  ";
  if (r.baseline !== undefined) {
    const sign = r.pctChange >= 0 ? "+" : "";
    delta = `${sign}${r.pctChange.toFixed(1)}%`;
  }
  const deltaColored =
    r.regression
      ? chalk.red.bold(delta.padStart(7))
      : r.pctChange < -5
        ? chalk.green(delta.padStart(7))
        : chalk.dim(delta.padStart(7));

  // Error path
  if (r.error) {
    console.log(
      `  ${chalk.dim(time.padEnd(9))} ${chalk.dim((r.source).padEnd(10))} ${chalk.dim(label.slice(0, 26).padEnd(26))} ` +
        chalk.red(`  EXPLAIN error: ${r.error.slice(0, 50)}`),
    );
    return;
  }

  // Regression indicator
  const prefix = r.regression ? chalk.red("⚡ ") : "  ";

  const co2Str =
    r.co2Grams !== null ? `${r.co2Grams.toFixed(2)}g` : "  n/a  ";

  const line =
    `${prefix}${chalk.dim(time.padEnd(9))} ` +
    `${chalk.cyan((r.source).padEnd(10))} ` +
    `${label.slice(0, 26).padEnd(26)} ` +
    `${nodeColored.padEnd(16)} ` +
    `${String(r.planCost.toFixed(1)).padStart(8)} ` +
    `${deltaColored} ` +
    `${r.appDurationMs !== undefined ? String(r.appDurationMs.toFixed(0)).padStart(7) : "     —"} ` +
    `${chalk.dim(co2Str.padStart(10))}`;

  console.log(line);

  // Print a regression warning block
  if (r.regression) {
    console.log(
      chalk.red(
        `    ↳ REGRESSION: cost ${r.planCost.toFixed(1)} vs baseline ${r.baseline!.toFixed(1)} (+${r.pctChange.toFixed(1)}%)`,
      ),
    );
    console.log(chalk.dim(`    ↳ SQL: ${r.sql.slice(0, 100).replace(/\s+/g, " ")}...`));
  }
}

/** Print a summary footer when the user hits Ctrl+C */
export function printWatchSummary(): void {
  console.log("\n" + chalk.dim("─".repeat(102)));
  console.log(
    chalk.bold("\n  QueryPilot Watch — Session Summary\n"),
  );
  console.log(`  Total queries intercepted : ${chalk.bold(stats.total)}`);
  console.log(
    `  Regressions detected      : ${
      stats.regressions > 0
        ? chalk.red.bold(stats.regressions)
        : chalk.green("0")
    }`,
  );
  console.log(
    `  Sequential scans flagged  : ${
      stats.seqScans > 0 ? chalk.yellow(stats.seqScans) : chalk.green("0")
    }`,
  );
  console.log(
    `  Total CO₂e (10k runs each): ${chalk.dim(stats.totalCo2.toFixed(2) + " gCO₂e")}`,
  );
  console.log("");
}
