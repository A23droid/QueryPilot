import { readFile } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import { explainQueryAuthorized } from "../db/explainAuthorized.js";
import { printPlanNode } from "../utils/planPrinter.js";
import { analyzePlan } from "../utils/planAnalyzer.js";
import { pool } from "../db/connection.js";

const SEVERITY_ICON: Record<string, string> = {
  critical: chalk.red("✖ CRITICAL"),
  warning: chalk.yellow("⚠ WARNING "),
  info: chalk.cyan("ℹ INFO    "),
};

export async function analyzeQueryAuthorized(
  file: string,
  opts: { useArmorIQ?: boolean } = {},
) {
  const spinner = ora(`Analyzing ${chalk.bold(file)}`).start();

  try {
    const sql = await readFile(file, "utf8");
    const plan = await explainQueryAuthorized(sql, {
      useArmorIQ: !!opts.useArmorIQ,
      goal: `Analyze and explain execution plan for SQL in ${file}`,
    });
    spinner.succeed("EXPLAIN complete");

    console.log("\n" + chalk.bold.underline("Execution Plan"));
    console.log(chalk.dim("─".repeat(60)));
    printPlanNode(plan as any);

    const findings = analyzePlan(plan as any);
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
