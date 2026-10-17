import { describe, it, expect } from "vitest";
import { formatPlanNode, type PlanNode } from "../src/utils/planPrinter.js";

describe("planPrinter - formatPlanNode", () => {
  it("formats a single plan node with cost and rows", () => {
    const node: PlanNode = {
      "Node Type": "Seq Scan",
      "Relation Name": "users",
      "Total Cost": 142.5,
      "Plan Rows": 1000,
    };

    const output = formatPlanNode(node);
    expect(output).toContain("Seq Scan on users");
    expect(output).toContain("cost=142.50");
    expect(output).toContain("rows=1000");
  });

  it("includes index name and index condition when present", () => {
    const node: PlanNode = {
      "Node Type": "Index Scan",
      "Relation Name": "orders",
      "Index Name": "orders_user_id_idx",
      "Total Cost": 8.29,
      "Plan Rows": 1,
      "Index Cond": "(user_id = 42)",
    };

    const output = formatPlanNode(node);
    expect(output).toContain("Index Scan on orders [orders_user_id_idx]");
    expect(output).toContain("index cond: (user_id = 42)");
  });

  it("includes actual timings and rows when available (ANALYZE mode)", () => {
    const node: PlanNode = {
      "Node Type": "Sort",
      "Total Cost": 25.0,
      "Plan Rows": 50,
      "Actual Total Time": 1.456,
      "Actual Rows": 50,
    };

    const output = formatPlanNode(node);
    expect(output).toContain("actual=1.46 ms");
    expect(output).toContain("actual_rows=50");
  });

  it("recursively formats child plans with tree indentation and connectors", () => {
    const rootNode: PlanNode = {
      "Node Type": "Nested Loop",
      "Total Cost": 200,
      "Plan Rows": 10,
      Plans: [
        {
          "Node Type": "Index Scan",
          "Relation Name": "users",
          "Total Cost": 8.29,
          "Plan Rows": 1,
        },
        {
          "Node Type": "Seq Scan",
          "Relation Name": "orders",
          "Total Cost": 150,
          "Plan Rows": 500,
        },
      ],
    };

    const output = formatPlanNode(rootNode);
    expect(output).toContain("Nested Loop");
    expect(output).toContain("└─ Index Scan on users");
    expect(output).toContain("└─ Seq Scan on orders");
  });
});
