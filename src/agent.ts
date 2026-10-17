/**
 * agent.ts — QueryPilot Autonomous AI Agent Loop
 *
 * Demonstrates an autonomous AI agent workflow governed by ArmorIQ:
 *
 * 1. AI Agent detects a slow or anti-pattern SQL query.
 * 2. Agent invokes 'explain_query' via ArmorIQ:
 *    -> Token evaluated against policy: ALLOWED (read-only inspection).
 *    -> Returns PostgreSQL execution plan.
 * 3. Agent passes plan to LLM (Groq / Llama) for automated bottleneck diagnosis.
 * 4. Agent attempts autonomous remediation via 'apply_index':
 *    -> Token evaluated against policy: BLOCKED (write operations restricted).
 *    -> ArmorIQ security perimeter stops the unauthorized write call.
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import { authorizedToolCall } from "./security/armoriq.js";
import { suggestFixes } from "./llm/suggest.js";
import { analyzePlan } from "./utils/planAnalyzer.js";
import { printPlanNode } from "./utils/planPrinter.js";
import { pool } from "./db/connection.js";
import { renderTerminalMarkdown } from "./utils/formatMarkdown.js";

async function runAgent() {
  console.log(chalk.bold.cyan("\n========================================================"));
  console.log(chalk.bold.cyan("   QueryPilot Autonomous AI Agent (ArmorIQ Protected)   "));
  console.log(chalk.bold.cyan("========================================================\n"));

  const sqlFile = process.argv[2] || "queries/slow.sql";
  const sql = await readFile(sqlFile, "utf8");

  console.log(chalk.bold("Target Query:"), chalk.dim(sqlFile));
  console.log(chalk.dim(sql.trim()));
  console.log(chalk.dim("─".repeat(60)));

  // ── Step 1: Inspect Execution Plan (Allowed Action) ───────────────────────
  const explainSpinner = ora(
    "AI Agent requesting permission for read-only 'explain_query' tool...",
  ).start();

  let plan: any;
  try {
    const rawResult = await authorizedToolCall(
      "explain_query",
      { sql },
      "Inspect execution plan for slow query performance analysis",
    );
    explainSpinner.succeed(
      chalk.green("ArmorIQ Policy Decision: ALLOWED ✅ (querypilot-db.explain_query)"),
    );

    // Parse returned plan if wrapped
    if (typeof rawResult === "string") {
      plan = JSON.parse(rawResult);
    } else if (rawResult && (rawResult as any).content?.[0]?.text) {
      plan = JSON.parse((rawResult as any).content[0].text);
    } else {
      plan = rawResult;
    }

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

  // ── Step 3: Attempt Database Mutation (Blocked Action) ────────────────────
  console.log("\n" + chalk.bold.yellow("AI Agent attempting database remediation action: 'apply_index'..."));
  const mutateSpinner = ora(
    "AI Agent requesting authorization to execute 'apply_index'...",
  ).start();

  try {
    await authorizedToolCall(
      "apply_index",
      {
        sql: "CREATE INDEX CONCURRENTLY idx_users_created_at ON users(created_at);",
      },
      "Automatically apply suggested database index to resolve sequential scan",
    );
    mutateSpinner.warn(chalk.yellow("Action was permitted unexpectedly"));
  } catch (err: any) {
    mutateSpinner.fail(
      chalk.red("ArmorIQ Policy Decision: BLOCKED ⛔ (querypilot-db.apply_index)"),
    );
    console.log(
      chalk.bgRed.white(" SECURITY ENFORCEMENT "),
      chalk.redBright(err.message ?? err),
    );
    console.log(
      chalk.dim(
        "\nArmorIQ prevented unauthorized write access to the database.\nAutonomous agents are restricted from modifying database schema or indexes without human approval.",
      ),
    );
  }

  console.log(chalk.bold.cyan("\n========================================================"));
  console.log(chalk.green("✔ Agent Run Completed with Real ArmorIQ Policy Enforcement"));
  console.log(chalk.bold.cyan("========================================================\n"));

  await pool.end();
  process.exit(0);
}

runAgent().catch(async (err) => {
  console.error("Agent failed:", err);
  await pool.end();
  process.exit(1);
});
