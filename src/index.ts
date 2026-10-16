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
import { analyzeQuery } from "./actions/analyze.js";
import { optimizeQuery } from "./actions/optimize.js";
import { benchmarkQuery } from "./actions/benchmark.js";
import { compareQuery, saveBaselineAction } from "./actions/compare.js";

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

program.parseAsync(process.argv);