#!/usr/bin/env node

/**
 * index.ts — QueryPilot CLI entry point
 *
 * Teaching note — how Commander.js works:
 *   program.command("foo <arg>")  → registers a sub-command called "foo" with a required arg
 *   .option("--flag [value]")     → adds an optional flag
 *   .action(async (arg, opts) => {}) → runs when the user types `qp foo <arg>`
 *
 *   Commander parses process.argv and routes to the right action automatically.
 */

import { Command } from "commander";
import chalk from "chalk";
import { analyzeQuery } from "./actions/analyze.js";
import { optimizeQuery } from "./actions/optimize.js";
import { benchmarkQuery } from "./actions/benchmark.js";
import { compareQuery, saveBaselineAction } from "./actions/compare.js";
import { generateReport } from "./actions/report.js";
import {
  parsePrismaSchema,
  readPrismaSchema,
  modelToSql,
  modelToSelectSql,
} from "./db/prismaParser.js";

const program = new Command();

program
  .name("qp")
  .description(
    "QueryPilot — catch slow database queries before they reach production",
  )
  .version("0.2.0");

// ── analyze ─────────────────────────────────────────────────────────────────
program
  .command("analyze <file>")
  .description(
    "Run EXPLAIN on a SQL file and print the execution plan with color-coded analysis",
  )
  .action(async (file: string) => {
    await analyzeQuery(file);
  });

// ── optimize ─────────────────────────────────────────────────────────────────
program
  .command("optimize <file>")
  .description(
    "Analyse the query plan and suggest concrete index/rewrite optimizations",
  )
  .action(async (file: string) => {
    await optimizeQuery(file);
  });

// ── benchmark ────────────────────────────────────────────────────────────────
program
  .command("benchmark <file>")
  .description("Run the query N times and report latency percentiles (p50/p95/p99)")
  .option("-r, --runs <number>", "Number of benchmark runs", "10")
  .action(async (file: string, opts: { runs: string }) => {
    await benchmarkQuery(file, { runs: parseInt(opts.runs, 10) });
  });

// ── baseline ─────────────────────────────────────────────────────────────────
//
// Teaching note — nested sub-commands:
//   Commander supports command hierarchies: `qp baseline save <file>`
//   We create a parent "baseline" command and add "save" as a child.
//
const baseline = program
  .command("baseline")
  .description("Manage query plan baselines for regression detection");

baseline
  .command("save <file>")
  .description("Save the current EXPLAIN plan as a baseline snapshot")
  .option("--ref <ref>", "Git ref or label (informational, e.g. main@abc123)")
  .action(async (file: string, opts: { ref?: string }) => {
    await saveBaselineAction(file, opts.ref);
  });

// ── compare ──────────────────────────────────────────────────────────────────
program
  .command("compare <file>")
  .description(
    "Compare current query plan against a saved baseline — exits non-zero on regression",
  )
  .action(async (file: string) => {
    await compareQuery(file);
  });

// ── report ───────────────────────────────────────────────────────────────────
program
  .command("report <file>")
  .description(
    "Generate a Markdown summary of the plan, findings, and baseline diff for PR comments",
  )
  .action(async (file: string) => {
    const report = await generateReport(file);
    console.log(report);
  });

// ── prisma ───────────────────────────────────────────────────────────────────
program
  .command("prisma <file>")
  .description(
    "Parse a Prisma schema file and print model structure + generated SQL",
  )
  .option("--sql", "Print generated CREATE TABLE / SELECT SQL for each model")
  .option(
    "--analyze <model>",
    "Run EXPLAIN on a generated SELECT * query for the given model name",
  )
  .action(async (file: string, opts: { sql?: boolean; analyze?: string }) => {
    const schema = await readPrismaSchema(file);

    console.log(
      `\nParsed ${schema.models.length} model(s) from ${chalk.bold(file)}\n`,
    );

    for (const model of schema.models) {
      console.log(
        `${chalk.bold.cyan("model ")} ${chalk.bold.white(model.name)}`,
      );
      console.log(chalk.dim(`  fields: ${model.fields.length}`));
      console.log(chalk.dim(`  relations: ${model.relations.length}`));

      for (const field of model.fields) {
        const modifiers: string[] = [];
        if (field.isOptional) modifiers.push("optional");
        if (field.isList) modifiers.push("list");
        const modStr =
          modifiers.length > 0
            ? chalk.dim(` [${modifiers.join(", ")}]`)
            : "";
        console.log(
          `    ${chalk.white(field.name)} ${chalk.dim(field.baseType)}${modStr}`,
        );
      }

      for (const rel of model.relations) {
        console.log(
          `    ${chalk.yellow("relation")} ${rel.field} → ${rel.targetModel} (${rel.kind})`,
        );
      }

      if (opts.sql) {
        console.log(chalk.dim(`  SQL:\n${modelToSql(model)}`));
      }

      if (opts.analyze === model.name) {
        const { explainQuery } = await import("./db/explain.js");
        const { pool } = await import("./db/connection.js");
        try {
          const selectSql = modelToSelectSql(model);
          const plan = await explainQuery(selectSql);
          console.log(
            chalk.green(`\n  EXPLAIN for "SELECT * FROM ${model.name}" LIMIT 1:`),
          );
          const { printPlanNode } = await import("./utils/planPrinter.js");
          printPlanNode(plan);
        } finally {
          await pool.end();
        }
      }

      console.log("");
    }

    if (schema.datasource) {
      console.log(
        `  datasource: ${chalk.dim(schema.datasource.provider ?? "?")}`,
      );
    }
    if (schema.generator) {
      console.log(
        `  generator: ${chalk.dim(schema.generator.provider ?? "?")}`,
      );
    }
    console.log("");
  });

program.parseAsync(process.argv);