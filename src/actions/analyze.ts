import { readFile } from "node:fs/promises";
import { explainQuery } from "../db/explain.js";

export async function analyzeQuery(file: string) {
    try {
      const sql = await readFile(file, "utf8");
      const plan = await explainQuery(sql);

      console.log("\nQuery Plan");
      console.log("==========");
      console.log(JSON.stringify(plan, null, 2));
    } catch (error) {
      console.error(
        "Analysis failed:",
        error instanceof Error ? error.message : error,
      );
      process.exitCode = 1;
    }
}