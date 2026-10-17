/**
 * llm/suggest.ts
 *
 * Optional LLM-powered query rewrite suggestions.
 *
 * This is gated behind an API key (GEMINI_API_KEY or OPENAI_API_KEY). When no
 * key is present it returns a graceful fallback message instead of crashing,
 * so CI stays deterministic and free.
 *
 * Deterministic rules (planAnalyzer.ts) are great at spotting anti-patterns
 * (Seq Scan, high cost, missing indexes) but bad at knowing *what* to rewrite.
 * The LLM step takes the SQL + findings + schema context and proposes concrete
 * query rewrites with rationale.
 */

export interface Finding {
  severity: string;
  message: string;
  suggestion: string;
  nodeType: string;
  relation?: string | undefined;
}

export interface LLMContext {
  sql: string;
  findings: Finding[];
  schema?: string; // optional Prisma schema or table DDL for context
}

const GEMINI_MODEL = "gemini-2.0-flash";
const GROQ_MODEL = "openai/gpt-oss-120b";

function buildPrompt(ctx: LLMContext): string {
  const findingsText = ctx.findings
    .map(
      (f) =>
        `- [${f.severity}] ${f.message} (node: ${f.nodeType}${
          f.relation ? `, table: ${f.relation}` : ""
        })\n  Suggested fix: ${f.suggestion}`,
    )
    .join("\n");

  return `You are a PostgreSQL performance expert. A developer ran a query through QueryPilot and got these findings:

QUERY:
\`\`\`sql
${ctx.sql}
\`\`\`

FINDINGS:
${findingsText || "None detected."}

${ctx.schema ? `SCHEMA CONTEXT:\n\`\`\`prisma\n${ctx.schema}\n\`\`\`\n` : ""}

Tasks:
1. For each finding, explain in plain English why it's a problem.
2. Propose a concrete rewritten SQL query that fixes it.
3. Recommend specific indexes (column names) if any are missing.

Formatting Instructions (for CLI Terminal output):
- DO NOT output markdown tables (| ... |). Markdown tables break across narrow terminals.
- Use clear bullet points (•) and concise paragraphs instead.
- Use sql code blocks for queries and index statements.
- Keep it concise, actionable, and readable on a standard command-line terminal.

Do not invent tables or columns that aren't visible in the query or schema. If you're unsure, say so.`;
}

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1500,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const candidates = data?.candidates ?? [];
  if (candidates.length === 0) return "No suggestions returned.";

  const parts = candidates[0]?.content?.parts ?? [];
  const texts = parts.map((p) => p.text ?? "").join("\n");
  return texts || "No suggestions returned.";
}

async function callOpenAI(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 1500,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "No suggestions returned.";
}

async function callGroq(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 1500,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "No suggestions returned.";
}

/**
 * Get LLM-powered rewrite suggestions for a query's findings.
 *
 * Falls back gracefully if no API key is configured.
 */
export async function suggestFixes(ctx: LLMContext): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (!geminiKey && !openaiKey && !groqKey) {
    return `## 🤖 LLM Query Rewrite Suggestions

No LLM API key configured. Set \`GROQ_API_KEY\` (recommended, Llama model),
\`GEMINI_API_KEY\`, or \`OPENAI_API_KEY\` in your environment to get AI-powered query rewrite suggestions.

Deterministic findings are still shown above — use those as your starting point.`;
  }

  const prompt = buildPrompt(ctx);

  try {
    if (groqKey) {
      const text = await callGroq(groqKey, prompt);
      return `## 🤖 LLM Query Rewrite Suggestions (Llama via Groq)\n\n${text}`;
    }
    if (geminiKey) {
      const text = await callGemini(geminiKey, prompt);
      return `## 🤖 LLM Query Rewrite Suggestions\n\n${text}`;
    }
    if (openaiKey) {
      const text = await callOpenAI(openaiKey, prompt);
      return `## 🤖 LLM Query Rewrite Suggestions\n\n${text}`;
    }
  } catch (error) {
    return `## 🤖 LLM Query Rewrite Suggestions

Error contacting LLM API: ${error instanceof Error ? error.message : String(error)}

Deterministic findings are still shown above.`;
  }

  return "## 🤖 LLM Query Rewrite Suggestions\n\nNo suggestions available.";
}
