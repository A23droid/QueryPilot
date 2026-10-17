import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { generateReport } from "../src/actions/report.js";
import { explainQuery } from "../src/db/explain.js";
import { loadBaseline, type BaselineSnapshot } from "../src/utils/baseline.js";
import { pool } from "../src/db/connection.js";

vi.mock("../src/db/explain.js", () => ({
  explainQuery: vi.fn(),
}));

vi.mock("../src/utils/baseline.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/utils/baseline.js")>();
  return {
    ...actual,
    loadBaseline: vi.fn(),
  };
});

describe("report feature - Markdown PR comment generation", () => {
  let tempDir: string;
  let testSqlFile: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `qp-report-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
    testSqlFile = path.join(tempDir, "sample.sql");
    await writeFile(testSqlFile, "SELECT * FROM users WHERE id = 1;", "utf8");

    vi.spyOn(pool, "end").mockResolvedValue();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("generates markdown with plan, findings, and baseline comparison", async () => {
    vi.mocked(explainQuery).mockResolvedValue({
      "Node Type": "Seq Scan",
      "Relation Name": "users",
      "Plan Rows": 5000,
      "Total Cost": 150.0,
    });

    const mockBaseline: BaselineSnapshot = {
      capturedAt: "2026-10-15T10:00:00Z",
      ref: "main",
      totalCost: 100.0,
      plan: {
        "Node Type": "Index Scan",
        "Total Cost": 100.0,
      },
    };
    vi.mocked(loadBaseline).mockResolvedValue(mockBaseline);

    const markdown = await generateReport(testSqlFile, 20);

    expect(markdown).toContain("# QueryPilot Report");
    expect(markdown).toContain(`**File:** \`${testSqlFile}\``);
    expect(markdown).toContain("## Execution Plan");
    expect(markdown).toContain("Seq Scan on users");
    expect(markdown).toContain("## Findings");
    expect(markdown).toContain("🔴 CRITICAL");
    expect(markdown).toContain("## Cost Comparison vs Baseline");
    expect(markdown).toContain("🔴 REGRESSION");
    expect(markdown).toContain("+50.0%");
  });

  it("outputs clean message when no findings are detected", async () => {
    vi.mocked(explainQuery).mockResolvedValue({
      "Node Type": "Result",
      "Total Cost": 0.01,
      "Plan Rows": 1,
    });

    vi.mocked(loadBaseline).mockResolvedValue(null);

    const markdown = await generateReport(testSqlFile);

    expect(markdown).toContain("✔ No performance issues detected.");
    expect(markdown).not.toContain("## Cost Comparison vs Baseline");
  });
});
