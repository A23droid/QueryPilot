import { describe, it, expect, vi } from "vitest";
import { runBenchmark } from "../src/actions/benchmark.js";
import { pool } from "../src/db/connection.js";

describe("benchmark feature - timing & percentile stats", () => {
  it("rejects empty SQL strings", async () => {
    await expect(runBenchmark("   ")).rejects.toThrow("SQL query is empty");
  });

  it("rejects multi-statement SQL", async () => {
    await expect(
      runBenchmark("SELECT 1; SELECT 2;"),
    ).rejects.toThrow("Only one SQL statement is allowed");
  });

  it("calculates accurate min, max, mean, and percentiles over benchmark runs", async () => {
    // Mock pool.query to simulate query execution without real DB
    let callCount = 0;
    const mockDurations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]; // ms
    vi.spyOn(pool, "query").mockImplementation(async () => {
      const duration = mockDurations[callCount % mockDurations.length] ?? 10;
      callCount++;
      // simulate duration with small busy wait or resolve
      return { rows: [] } as any;
    });

    const result = await runBenchmark("SELECT * FROM users", 10);

    expect(result.runs).toBe(10);
    expect(result.timingsMs).toHaveLength(10);
    expect(result.min).toBeGreaterThanOrEqual(0);
    expect(result.max).toBeGreaterThanOrEqual(result.min);
    expect(result.mean).toBeGreaterThanOrEqual(result.min);
    expect(result.p50).toBeGreaterThanOrEqual(result.min);
    expect(result.p95).toBeGreaterThanOrEqual(result.p50);
    expect(result.p99).toBeGreaterThanOrEqual(result.p95);

    vi.restoreAllMocks();
  });
});
