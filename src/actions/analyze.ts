/**
 * analyze.ts — `qp analyze <file>`
 *
 * Reads a SQL file, runs EXPLAIN (FORMAT JSON), then prints a pretty tree
 * of the execution plan and a list of optimization findings.
 *
 * Teaching note:
 *   ora  = a terminal spinner library (shows a loading indicator while waiting)
 *   chalk = terminal colour library
 *   We use EXPLAIN without ANALYZE here so we don't actually execute the query —
 *   it's safe to run against production even on heavy queries.
 */

import { readFile } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import { explainQuery } from "../db/explain.js";
import { printPlanNode } from "../utils/planPrinter.js";
import { analyzePlan } from "../utils/planAnalyzer.js";
import { pool } from "../db/connection.js";

const SEVERITY_ICON: Record<string, string> = {
  critical: chalk.red("✖ CRITICAL"),
  warning: chalk.yellow("⚠ WARNING "),
  info: chalk.cyan("ℹ INFO    "),
};

export async function analyzeQuery(file: string) {
  const spinner = ora(`Analyzing ${chalk.bold(file)}`).start();

  try {
    const sql = await readFile(file, "utf8");
    const plan = await explainQuery(sql);
    spinner.succeed("EXPLAIN complete");

    // ── Print the plan tree ────────────────────────────────────────────
    console.log("\n" + chalk.bold.underline("Execution Plan"));
    console.log(chalk.dim("─".repeat(60)));
    printPlanNode(plan);

    // ── Print optimizer findings ───────────────────────────────────────
    const findings = analyzePlan(plan);
    if (findings.length === 0) {
      console.log("\n" + chalk.green("✔ No performance issues detected."));
    } else {
      console.log(
        "\n" + chalk.bold.underline("Optimization Findings") + chalk.dim(` (${findings.length})`),
      );
      console.log(chalk.dim("─".repeat(60)));

      for (const f of findings) {
        console.log(`\n${SEVERITY_ICON[f.severity]}  ${f.message}`);
        console.log(
          chalk.dim("   Suggestion: ") +
            chalk.white(f.suggestion.replace(/\n/g, "\n              ")),
        );
      }
    }

    console.log("");
  } catch (error) {
    spinner.fail("Analysis failed");
    console.error(
      chalk.red(error instanceof Error ? error.message : String(error)),
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}