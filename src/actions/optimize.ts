/**
 * optimize.ts — `qp optimize <file>`
 *
 * Runs EXPLAIN, analyses the plan with planAnalyzer, then prints:
 *   1. The plan tree (same as analyze)
 *   2. A prioritized list of findings with concrete SQL suggestions
 *   3. A summary: "X critical issues, Y warnings"
 *
 * Teaching note:
 *   This command is the "actionable" version of analyze. While `analyze`
 *   shows you the plan and findings, `optimize` frames everything as a
 *   list of numbered action items the developer should act on.
 *
 *   In a future iteration this could call an LLM to generate query rewrites,
 *   but for now it uses deterministic rules from planAnalyzer.ts which are
 *   fast, offline, and explainable.
 */

import { readFile } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import { explainQuery } from "../db/explain.js";
import { printPlanNode } from "../utils/planPrinter.js";
import { analyzePlan } from "../utils/planAnalyzer.js";
import { pool } from "../db/connection.js";
import { suggestFixes } from "../llm/suggest.js";

const SEVERITY_BADGE: Record<string, string> = {
  critical: chalk.bgRed.white(" CRITICAL "),
  warning: chalk.bgYellow.black(" WARNING  "),
  info: chalk.bgCyan.black("  INFO    "),
};

export async function optimizeQuery(
  file: string,
  opts: { suggest?: boolean } = {},
) {
  const spinner = ora(`Analyzing ${chalk.bold(file)} for optimizations`).start();

  try {
    const sql = await readFile(file, "utf8");
    const plan = await explainQuery(sql);
    spinner.succeed("Plan retrieved");

    // ── Plan tree ──────────────────────────────────────────────────────
    console.log("\n" + chalk.bold.underline("Execution Plan"));
    console.log(chalk.dim("─".repeat(60)));
    printPlanNode(plan);

    // ── Findings ───────────────────────────────────────────────────────
    const findings = analyzePlan(plan);
    const critical = findings.filter((f) => f.severity === "critical").length;
    const warnings = findings.filter((f) => f.severity === "warning").length;
    const infos = findings.filter((f) => f.severity === "info").length;

    if (findings.length === 0) {
      console.log(
        "\n" + chalk.green("✔ No optimization opportunities detected."),
      );
    } else {
      console.log(
        "\n" +
          chalk.bold.underline("Optimization Action Items") +
          chalk.dim(` (${findings.length} total)`),
      );
      console.log(chalk.dim("─".repeat(60)));

      findings.forEach((f, i) => {
        console.log(
          `\n  ${chalk.dim(`${i + 1}.`)} ${SEVERITY_BADGE[f.severity]}  ${chalk.bold(f.message)}`,
        );

        // Print the suggestion with code blocks highlighted
        const lines = f.suggestion.split("\n");
        for (const line of lines) {
          if (line.trim().startsWith("CREATE") || line.trim().startsWith("SELECT") || line.trim().startsWith("ANALYZE")) {
            console.log(
              "     " + chalk.bgBlack.greenBright("  " + line.trim() + "  "),
            );
          } else {
            console.log("     " + chalk.white(line));
          }
        }
      });

      // ── Summary ─────────────────────────────────────────────────────
      console.log("\n" + chalk.dim("─".repeat(60)));
      const parts: string[] = [];
      if (critical > 0) parts.push(chalk.red(`${critical} critical`));
      if (warnings > 0) parts.push(chalk.yellow(`${warnings} warning${warnings === 1 ? "" : "s"}`));
      if (infos > 0) parts.push(chalk.cyan(`${infos} info`));
      console.log("  Summary: " + parts.join(", "));
    }

    // ── LLM-powered rewrite suggestions ─────────────────────────────────
    if (opts.suggest) {
      const llmOutput = await suggestFixes({
        sql: sql,
        findings: findings,
      });
      console.log("\n" + llmOutput + "\n");
    }

    // ── Exit code reflects severity ────────────────────────────────────
    if (critical > 0) {
      process.exitCode = 2;
    } else if (warnings > 0) {
      process.exitCode = 1;
    }

    console.log("");
  } catch (error) {
    spinner.fail("Optimization analysis failed");
    console.error(
      chalk.red(error instanceof Error ? error.message : String(error)),
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
