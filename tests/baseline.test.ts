import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  baselinePath,
  saveBaseline,
  loadBaseline,
  diffCost,
  type BaselineSnapshot,
} from "../src/utils/baseline.js";
import type { PlanNode } from "../src/utils/planPrinter.js";

describe("baselinePath", () => {
  it("derives the .baseline.json path next to the sql file", () => {
    const p = baselinePath("/app/queries/report.sql");
    expect(p).toBe(path.normalize("/app/queries/report.baseline.json"));
  });

  it("handles relative paths correctly", () => {
    const p = baselinePath("queries/slow.sql");
    expect(p).toBe(path.normalize("queries/slow.baseline.json"));
  });
});

describe("diffCost", () => {
  const dummyPlan: PlanNode = {
    "Node Type": "Seq Scan",
    "Total Cost": 150,
  };

  it("calculates cost regression correctly", () => {
    const baseline: BaselineSnapshot = {
      capturedAt: new Date().toISOString(),
      plan: { "Node Type": "Index Scan", "Total Cost": 100 },
      totalCost: 100,
    };

    const diff = diffCost(baseline, dummyPlan);
    expect(diff.baseline).toBe(100);
    expect(diff.current).toBe(150);
    expect(diff.delta).toBe(50);
    expect(diff.pctChange).toBe(50);
  });

  it("calculates cost improvement correctly", () => {
    const baseline: BaselineSnapshot = {
      capturedAt: new Date().toISOString(),
      plan: { "Node Type": "Seq Scan", "Total Cost": 200 },
      totalCost: 200,
    };

    const diff = diffCost(baseline, dummyPlan);
    expect(diff.delta).toBe(-50);
    expect(diff.pctChange).toBe(-25);
  });

  it("handles 0 baseline cost safely without division by zero", () => {
    const baseline: BaselineSnapshot = {
      capturedAt: new Date().toISOString(),
      plan: { "Node Type": "Result", "Total Cost": 0 },
      totalCost: 0,
    };

    const diff = diffCost(baseline, dummyPlan);
    expect(diff.pctChange).toBe(0);
  });
});

describe("saveBaseline & loadBaseline I/O", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `qp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("saves a baseline and loads it back accurately", async () => {
    const sqlFile = path.join(tempDir, "query.sql");
    const plan: PlanNode = {
      "Node Type": "Index Scan",
      "Total Cost": 42.5,
      "Plan Rows": 10,
    };

    const savedPath = await saveBaseline(sqlFile, plan, "v1.0.0", 12.4);
    expect(savedPath).toBe(path.join(tempDir, "query.baseline.json"));

    const loaded = await loadBaseline(sqlFile);
    expect(loaded).not.toBeNull();
    expect(loaded?.ref).toBe("v1.0.0");
    expect(loaded?.totalCost).toBe(42.5);
    expect(loaded?.medianMs).toBe(12.4);
    expect(loaded?.plan["Node Type"]).toBe("Index Scan");
  });

  it("returns null if baseline does not exist", async () => {
    const nonExistent = path.join(tempDir, "non_existent.sql");
    const loaded = await loadBaseline(nonExistent);
    expect(loaded).toBeNull();
  });
});
