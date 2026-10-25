/**
 * watch.ts — qp watch action
 *
 * Starts the QueryPilot watch server and live terminal display.
 * Blocks until the user hits Ctrl+C, then prints a session summary.
 */

import chalk from "chalk";
import { startWatchServer, subscribeToResults } from "../watch/server.js";
import {
  printWatchHeader,
  printQueryResult,
  printWatchSummary,
} from "../watch/display.js";

export async function startWatch(port: number): Promise<void> {
  let shutdown: (() => Promise<void>) | null = null;

  // Graceful Ctrl+C handler
  const handleExit = async () => {
    printWatchSummary();
    if (shutdown) await shutdown();
    process.exit(0);
  };

  process.on("SIGINT", () => void handleExit());
  process.on("SIGTERM", () => void handleExit());

  try {
    shutdown = await startWatchServer(port);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "EADDRINUSE"
    ) {
      console.error(
        chalk.red(
          `\n  ✖ Port ${port} is already in use. Is another qp watch already running?\n` +
            `    Try: qp watch --port ${port + 1}\n`,
        ),
      );
      process.exit(1);
    }
    throw err;
  }

  // Subscribe the display to results from the server
  subscribeToResults(printQueryResult);

  printWatchHeader(port);

  // Print a guide snippet for the user
  console.log(
    chalk.dim("\n  Quick setup — add to your app's Prisma client:\n"),
  );
  console.log(
    chalk.dim("  ┌─────────────────────────────────────────────────────┐"),
  );
  console.log(
    chalk.dim("  │ ") +
      chalk.yellow("import") +
      chalk.white(" { PrismaClient }") +
      chalk.yellow(" from") +
      chalk.green(" '@prisma/client'") +
      chalk.dim("         │"),
  );
  console.log(
    chalk.dim("  │ ") +
      chalk.yellow("import") +
      chalk.white(" { attachQueryPilot }") +
      chalk.yellow(" from") +
      chalk.green(" 'querypilot/middleware'") +
      chalk.dim(" │"),
  );
  console.log(chalk.dim("  │                                                     │"));
  console.log(
    chalk.dim("  │ ") +
      chalk.yellow("export const") +
      chalk.white(" prisma") +
      chalk.dim(" = ") +
      chalk.cyan("attachQueryPilot") +
      chalk.white("(") +
      chalk.dim("             │"),
  );
  console.log(
    chalk.dim("  │   ") +
      chalk.yellow("new") +
      chalk.cyan(" PrismaClient") +
      chalk.white("({") +
      chalk.dim(" log: [{") +
      chalk.yellow(" emit") +
      chalk.dim(": ") +
      chalk.green("'event'") +
      chalk.dim(",") +
      chalk.yellow(" level") +
      chalk.dim(": ") +
      chalk.green("'query'") +
      chalk.dim(" }] }) │"),
  );
  console.log(
    chalk.dim("  │ ") + chalk.white(")") + chalk.dim("                                                   │"),
  );
  console.log(
    chalk.dim("  └─────────────────────────────────────────────────────┘\n"),
  );

  // Keep the process alive
  await new Promise<never>(() => {});
}
