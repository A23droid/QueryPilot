#!/usr/bin/env node

import { Command } from "commander";
import { analyzeQuery } from "./actions/analyze.js";

const program = new Command();

program
  .name("querypilot")
  .description("AI-powered PostgreSQL query optimization")
  .version("0.1.0");

program
  .command("analyze <file>")
  .description("Analyze a SQL query")
  .action(async (file: string) => {
    await analyzeQuery(file);
  });

program
  .command("optimize <file>")
  .description("Find and test query optimizations")
  .action(async (file: string) => {
    console.log(`Optimizing ${file}...`);
  });

program
  .command("benchmark <file>")
  .description("Benchmark a SQL query")
  .action(async (file: string) => {
    console.log(`Benchmarking ${file}...`);
  });

program.parseAsync(process.argv);