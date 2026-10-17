import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { suggestFixes, type LLMContext } from "../src/llm/suggest.js";

describe("llm/suggest feature - AI query rewrite logic", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns helpful fallback guidance when no API keys are present in env", async () => {
    const ctx: LLMContext = {
      sql: "SELECT * FROM orders WHERE total > 100;",
      findings: [
        {
          severity: "critical",
          message: "Sequential scan on 'orders' estimated 50,000 rows",
          suggestion: "CREATE INDEX ON orders (total);",
          nodeType: "Seq Scan",
          relation: "orders",
        },
      ],
    };

    const result = await suggestFixes(ctx);

    expect(result).toContain("## 🤖 LLM Query Rewrite Suggestions");
    expect(result).toContain("No LLM API key configured");
    expect(result).toContain("GROQ_API_KEY");
    expect(result).toContain("Deterministic findings are still shown above");
  });
});
