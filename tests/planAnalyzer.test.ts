/**
 * planAnalyzer.test.ts
 *
 * Unit tests for the static plan analysis rules in planAnalyzer.ts.
 */

import { describe, it, expect } from "vitest";
import { analyzePlan, type Finding } from "../src/utils/planAnalyzer.js";
import type { PlanNode } from "../src/utils/planPrinter.js";

function makeNode(overrides: Partial<PlanNode>): PlanNode {
  return {
    "Node Type": "Seq Scan",
    "Total Cost": 0,
    "Plan Rows": 0,
    ...overrides,
  };
}

describe("Rule 1 — Seq Scan on large table", () => {
  it("emits a CRITICAL finding when estimated rows exceed 1,000", () => {
    const node = makeNode({
      "Node Type": "Seq Scan",
      "Plan Rows": 5_000,
      "Relation Name": "orders",
    });
    const findings = analyzePlan(node);
    const critical = findings.filter((f) => f.severity === "critical");
    expect(critical.length).toBeGreaterThanOrEqual(1);
    expect(critical[0]!.message).toContain("orders");
    expect(critical[0]!.message).toContain("5,000");
  });

  it("includes a suggestion with CREATE INDEX", () => {
    const node = makeNode({
      "Node Type": "Seq Scan",
      "Plan Rows": 2_000,
      "Relation Name": "products",
    });
    const [finding] = analyzePlan(node).filter((f) => f.severity === "critical");
    expect(finding!.suggestion).toMatch(/CREATE INDEX/i);
    expect(finding!.suggestion).toContain("products");
  });
});

describe("Rule 2 — Seq Scan on small table", () => {
  it("emits an INFO finding for ≤1,000 rows", () => {
    const node = makeNode({
      "Node Type": "Seq Scan",
      "Plan Rows": 50,
      "Relation Name": "config",
    });
    const findings = analyzePlan(node);
    const info = findings.filter((f) => f.severity === "info");
    expect(info.length).toBeGreaterThanOrEqual(1);
    expect(info[0]!.message).toContain("config");
  });

  it("does NOT emit CRITICAL when rows ≤ 1,000", () => {
    const node = makeNode({ "Node Type": "Seq Scan", "Plan Rows": 999 });
    const critical = analyzePlan(node).filter((f) => f.severity === "critical");
    expect(critical.length).toBe(0);
  });
});

describe("Rule 3 — High total cost node", () => {
  it("emits a WARNING for nodes with cost > 10,000", () => {
    const node = makeNode({
      "Node Type": "Hash Join",
      "Total Cost": 50_000,
      "Plan Rows": 100,
    });
    const findings = analyzePlan(node);
    const warnings = findings.filter((f) => f.severity === "warning");
    expect(warnings.some((f) => f.message.includes("50000"))).toBe(true);
  });

  it("does NOT emit high-cost WARNING at exactly 10,000", () => {
    const node = makeNode({
      "Node Type": "Hash Join",
      "Total Cost": 10_000,
      "Plan Rows": 100,
    });
    const warnings = analyzePlan(node).filter(
      (f) => f.severity === "warning" && f.message.includes("10000"),
    );
    expect(warnings.length).toBe(0);
  });
});

describe("Rule 4 — Sort step", () => {
  it("emits a WARNING for Sort node types", () => {
    const node = makeNode({ "Node Type": "Sort", "Total Cost": 100 });
    const findings = analyzePlan(node);
    const sortWarning = findings.find((f) => f.message.includes("Sort"));
    expect(sortWarning).toBeDefined();
    expect(sortWarning!.severity).toBe("warning");
  });

  it("includes an index suggestion", () => {
    const node = makeNode({ "Node Type": "Sort" });
    const [f] = analyzePlan(node).filter((f) => f.message.includes("Sort"));
    expect(f!.suggestion).toMatch(/index/i);
  });
});

describe("Rule 5 — Nested Loop + Seq Scan child", () => {
  it("emits a CRITICAL finding when Nested Loop has a Seq Scan child", () => {
    const node = makeNode({
      "Node Type": "Nested Loop",
      "Total Cost": 500,
      Plans: [
        makeNode({ "Node Type": "Index Scan", "Plan Rows": 10 }),
        makeNode({ "Node Type": "Seq Scan", "Plan Rows": 5_000, "Relation Name": "orders" }),
      ],
    });
    const findings = analyzePlan(node);
    const critical = findings.filter(
      (f) => f.severity === "critical" && f.nodeType === "Nested Loop",
    );
    expect(critical.length).toBeGreaterThanOrEqual(1);
    expect(critical[0]!.message).toContain("Nested Loop");
  });

  it("does NOT emit Nested Loop CRITICAL if no Seq Scan child", () => {
    const node = makeNode({
      "Node Type": "Nested Loop",
      "Total Cost": 500,
      Plans: [
        makeNode({ "Node Type": "Index Scan", "Plan Rows": 10 }),
        makeNode({ "Node Type": "Index Only Scan", "Plan Rows": 5 }),
      ],
    });
    const findings = analyzePlan(node);
    const critical = findings.filter(
      (f) => f.severity === "critical" && f.nodeType === "Nested Loop",
    );
    expect(critical.length).toBe(0);
  });
});

describe("Rule 6 — Large Hash build", () => {
  it("emits a WARNING when Hash node materialises > 50,000 rows", () => {
    const node = makeNode({
      "Node Type": "Hash",
      "Plan Rows": 100_000,
      "Total Cost": 1_000,
    });
    const findings = analyzePlan(node);
    const hashWarning = findings.find(
      (f) => f.severity === "warning" && f.nodeType === "Hash",
    );
    expect(hashWarning).toBeDefined();
    expect(hashWarning!.message).toContain("100,000");
  });

  it("does NOT warn for small Hash builds (≤ 50,000 rows)", () => {
    const node = makeNode({
      "Node Type": "Hash",
      "Plan Rows": 50_000,
      "Total Cost": 500,
    });
    const findings = analyzePlan(node);
    const hashWarning = findings.find(
      (f) => f.severity === "warning" && f.nodeType === "Hash",
    );
    expect(hashWarning).toBeUndefined();
  });
});

describe("analyzePlan — severity ordering", () => {
  it("returns findings sorted critical → warning → info", () => {
    const node = makeNode({
      "Node Type": "Nested Loop",
      "Total Cost": 50_001,
      Plans: [
        makeNode({ "Node Type": "Sort", "Plan Rows": 10 }),
        makeNode({ "Node Type": "Seq Scan", "Plan Rows": 2_000, "Relation Name": "users" }),
      ],
    });
    const findings = analyzePlan(node);
    const order = { critical: 0, warning: 1, info: 2 } as const;
    for (let i = 1; i < findings.length; i++) {
      expect(order[findings[i]!.severity]).toBeGreaterThanOrEqual(
        order[findings[i - 1]!.severity],
      );
    }
  });

  it("returns an empty array for an index-scan leaf with low cost", () => {
    const node = makeNode({
      "Node Type": "Index Scan",
      "Total Cost": 10,
      "Plan Rows": 1,
    });
    expect(analyzePlan(node)).toHaveLength(0);
  });
});
