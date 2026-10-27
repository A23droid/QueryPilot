/**
 * agent.ts — QueryPilot Autonomous AI Agent Loop
 *
 * Demonstrates an autonomous AI agent workflow:
 *
 * 1. AI Agent detects a slow or anti-pattern SQL query.
 * 2. Agent invokes 'explain_query' directly via database/MCP flow.
 * 3. Agent passes plan to LLM (Groq / Llama) for automated bottleneck diagnosis.
 * 4. Agent displays actionable optimization and indexing recommendations.
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import { explainQuery } from "./db/explain.js";
import { suggestFixes } from "./llm/suggest.js";
import { analyzePlan } from "./utils/planAnalyzer.js";
import { printPlanNode } from "./utils/planPrinter.js";
import { pool } from "./db/connection.js";
import { renderTerminalMarkdown } from "./utils/formatMarkdown.js";
import { calculateCarbonMetrics } from "./utils/carbon.js";

async function runAgent() {
  console.log(chalk.bold.cyan("\n========================================================"));
  console.log(chalk.bold.cyan("            QueryPilot Autonomous AI Agent              "));
  console.log(chalk.bold.cyan("========================================================\n"));

  const sqlFile = process.argv[2] || "queries/slow.sql";
  const sql = await readFile(sqlFile, "utf8");

  console.log(chalk.bold("Target Query:"), chalk.dim(sqlFile));
  console.log(chalk.dim(sql.trim()));
  console.log(chalk.dim("─".repeat(60)));

  // ── Step 1: Inspect Execution Plan ────────────────────────────────────────
  const explainSpinner = ora(
    "AI Agent inspecting query execution plan...",
  ).start();

  let plan: any;
  try {
    plan = await explainQuery(sql);
    explainSpinner.succeed(
      chalk.green("Execution plan retrieved successfully (explain_query)"),
    );

    console.log("\n" + chalk.bold.underline("PostgreSQL Execution Plan:"));
    if (plan) {
      printPlanNode(plan);
    }
  } catch (err: any) {
    explainSpinner.fail(chalk.red("explain_query failed: " + (err.message ?? err)));
    await pool.end();
    return;
  }

  // ── Step 2: LLM Optimization Analysis ─────────────────────────────────────
  const findings = plan ? analyzePlan(plan) : [];
  console.log(chalk.bold(`\nDetected ${findings.length} performance bottlenecks.`));

  if (plan && plan["Total Cost"]) {
    const carbon = calculateCarbonMetrics(Number(plan["Total Cost"]));
    console.log(
      chalk.green(
        `🌱 Green Compute (SCI): ~${carbon.energyKwh} kWh & ${carbon.co2Grams}g CO₂e per 10k executions (est. CPU: ${carbon.estCpuMs}ms)`,
      ),
    );
  }

  const aiSpinner = ora("AI Agent analyzing plan bottlenecks and generating optimizations...").start();
  let suggestions = "";
  try {
    suggestions = await suggestFixes({ sql, findings });
    aiSpinner.succeed(chalk.green("AI Optimization analysis generated"));
    console.log("\n" + chalk.bold.underline("AI Agent Recommendations:"));
    console.log(renderTerminalMarkdown(suggestions));
  } catch (err: any) {
    aiSpinner.warn("LLM suggestion skipped: " + err.message);
  }

  // ── Remediation Policy ────────────────────────────────────────────────────
  console.log("\n" + chalk.bold.cyan("Remediation Policy:"));
  console.log(
    chalk.dim(
      "QueryPilot operates in read-only analysis mode. Schema modifications require human review and approval.",
    ),
  );

  console.log(chalk.bold.cyan("\n========================================================"));
  console.log(chalk.green("✔ Agent Run Completed"));
  console.log(chalk.bold.cyan("========================================================\n"));

  await pool.end();
  process.exit(0);
}

runAgent().catch(async (err) => {
  const msg = err instanceof Error ? err.message : String(err);
  const sanitized = msg
    .replace(/:\/\/([^:]+):([^@]+)@/g, "://$1:***@")
    .replace(/Bearer\s+[A-Za-z0-9_\-\.~]+/gi, "Bearer ***")
    .replace(/ak_(?:live|claw|test)_[A-Za-z0-9]+/gi, "ak_***");
  console.error("Agent failed:", sanitized);
  await pool.end();
  process.exit(1);
});
