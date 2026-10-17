import { describe, it, expect } from "vitest";
import { diffCost, type BaselineSnapshot } from "../src/utils/baseline.js";
import { analyzePlan } from "../src/utils/planAnalyzer.js";
import type { PlanNode } from "../src/utils/planPrinter.js";

describe("compare feature - regression detection & threshold logic", () => {
  const baseSnapshot: BaselineSnapshot = {
    capturedAt: "2026-10-16T12:00:00Z",
    ref: "main",
    totalCost: 100.0,
    plan: {
      "Node Type": "Index Scan",
      "Total Cost": 100.0,
    },
  };

  it("identifies a regression exceeding default 20% threshold", () => {
    const currentPlan: PlanNode = {
      "Node Type": "Seq Scan",
      "Relation Name": "orders",
      "Plan Rows": 5000,
      "Total Cost": 125.0, // +25%
    };

    const diff = diffCost(baseSnapshot, currentPlan);
    const threshold = 20;
    const isRegression = diff.pctChange > threshold;

    expect(diff.pctChange).toBe(25);
    expect(isRegression).toBe(true);

    const findings = analyzePlan(currentPlan);
    expect(findings.some((f) => f.severity === "critical")).toBe(true);
  });

  it("respects custom threshold (e.g. 30%) where 25% change is NOT a regression", () => {
    const currentPlan: PlanNode = {
      "Node Type": "Seq Scan",
      "Total Cost": 125.0, // +25%
    };

    const diff = diffCost(baseSnapshot, currentPlan);
    const customThreshold = 30;
    const isRegression = diff.pctChange > customThreshold;

    expect(isRegression).toBe(false);
  });

  it("detects an improvement when cost decreases by more than threshold", () => {
    const currentPlan: PlanNode = {
      "Node Type": "Index Scan",
      "Total Cost": 60.0, // -40%
    };

    const diff = diffCost(baseSnapshot, currentPlan);
    const threshold = 20;
    const isImprovement = diff.pctChange < -threshold;

    expect(diff.pctChange).toBe(-40);
    expect(isImprovement).toBe(true);
  });

  it("considers cost within +/- threshold as neutral (no regression or improvement)", () => {
    const currentPlan: PlanNode = {
      "Node Type": "Index Scan",
      "Total Cost": 105.0, // +5%
    };

    const diff = diffCost(baseSnapshot, currentPlan);
    const threshold = 20;
    const isRegression = diff.pctChange > threshold;
    const isImprovement = diff.pctChange < -threshold;

    expect(isRegression).toBe(false);
    expect(isImprovement).toBe(false);
  });
});
