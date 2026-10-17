/**
 * compare.ts — `qp compare <file>` and `qp baseline save <file>`
 *
 * compare: loads a .baseline.json snapshot and diffs it against the current
 *          EXPLAIN plan. Flags cost regressions and prints a colour-coded diff.
 *
 * Teaching note — why baseline comparison matters for CI:
 *   When a developer opens a PR that touches a query, we want to know:
 *   "Is this query now slower than it was on main branch?"
 *
 *   The workflow is:
 *     1. On the main branch CI run:  qp baseline save queries/report.sql
 *        → saves queries/report.baseline.json (commit this file)
 *     2. On the PR CI run:           qp compare queries/report.sql
 *        → loads the baseline, compares, exits with code 1 if cost ↑ > threshold
 *     3. GitHub Actions reads the exit code and posts a PR comment if non-zero.
 *
 *   This gives you automatic performance regression detection on every PR.
 */

import { readFile } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import { explainQuery } from "../db/explain.js";
import { printPlanNode } from "../utils/planPrinter.js";
import { analyzePlan } from "../utils/planAnalyzer.js";
import {
  saveBaseline,
  loadBaseline,
  diffCost,
} from "../utils/baseline.js";
import { pool } from "../db/connection.js";

/** Default threshold: cost increase above this % is a regression. */
const DEFAULT_REGRESSION_THRESHOLD_PCT = 20;

// ── save sub-command ───────────────────────────────────────────────────────

export async function saveBaselineAction(file: string, ref?: string) {
  const spinner = ora(`Saving baseline for ${chalk.bold(file)}`).start();

  try {
    const sql = await readFile(file, "utf8");
    const plan = await explainQuery(sql);
    const dest = await saveBaseline(file, plan, ref);
    spinner.succeed(
      `Baseline saved → ${chalk.cyan(dest)} (cost: ${plan["Total Cost"]?.toFixed(2)})`,
    );
  } catch (error) {
    spinner.fail("Failed to save baseline");
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

// ── compare sub-command ────────────────────────────────────────────────────

export async function compareQuery(file: string, threshold = DEFAULT_REGRESSION_THRESHOLD_PCT) {
  const spinner = ora(`Comparing ${chalk.bold(file)} against baseline`).start();

  try {
    // Load baseline first — fail fast if it doesn't exist
    const baseline = await loadBaseline(file);
    if (!baseline) {
      spinner.fail("No baseline found");
      console.error(
        chalk.red(
          `No baseline file found. Run: qp baseline save ${file}  (on your main branch)`,
        ),
      );
      process.exitCode = 1;
      return;
    }

    const sql = await readFile(file, "utf8");
    const currentPlan = await explainQuery(sql);
    spinner.succeed("Comparison ready");

    // ── Print current plan ─────────────────────────────────────────────
    console.log("\n" + chalk.bold.underline("Current Plan"));
    console.log(chalk.dim("─".repeat(60)));
    printPlanNode(currentPlan);

    // ── Cost diff ──────────────────────────────────────────────────────
    const diff = diffCost(baseline, currentPlan);
    const isRegression = diff.pctChange > threshold;
    const isImprovement = diff.pctChange < -threshold;

    console.log("\n" + chalk.bold.underline("Cost Comparison"));
    console.log(chalk.dim("─".repeat(60)));
    console.log(
      `  Baseline:  ${chalk.dim(`(${baseline.capturedAt})`)}  cost = ${chalk.white(diff.baseline.toFixed(2))}`,
    );
    console.log(`  Current:                          cost = ${chalk.white(diff.current.toFixed(2))}`);

    const arrow = diff.delta > 0 ? "↑" : "↓";
    const deltaColour = isRegression
      ? chalk.red
      : isImprovement
        ? chalk.green
        : chalk.dim;

    console.log(
      `  Delta:     ${deltaColour(`${arrow} ${Math.abs(diff.delta).toFixed(2)} (${diff.pctChange > 0 ? "+" : ""}${diff.pctChange.toFixed(1)}%)`)}`,
    );

    // ── Regression / improvement banner ───────────────────────────────
    if (isRegression) {
      console.log(
        "\n" +
          chalk.bgRed.white(
            ` ✖ REGRESSION: cost increased by ${diff.pctChange.toFixed(1)}% (threshold: ${threshold}%) `,
          ),
      );

      // Also print new findings
      const findings = analyzePlan(currentPlan);
      if (findings.length > 0) {
        console.log("\n" + chalk.red("Optimization issues contributing to this regression:"));
        for (const f of findings) {
          console.log(
            chalk.dim(`  • [${f.severity}] `) + chalk.white(f.message),
          );
        }
      }

      process.exitCode = 1; // CI will see this and post a PR comment
    } else if (isImprovement) {
      console.log(
        "\n" +
          chalk.bgGreen.black(
            ` ✔ IMPROVEMENT: cost decreased by ${Math.abs(diff.pctChange).toFixed(1)}% `,
          ),
      );
    } else {
      console.log(
        "\n" + chalk.green("✔ No significant cost change detected."),
      );
    }

    console.log("");
  } catch (error) {
    spinner.fail("Comparison failed");
    console.error(
      chalk.red(error instanceof Error ? error.message : String(error)),
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
