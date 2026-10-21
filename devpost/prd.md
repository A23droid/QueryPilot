---
doc: prd
status: approved
---

# QueryPilot — Product Requirements

Catch database performance regressions and govern autonomous database agents before they reach production.  
Source: `scope.md > The Unique Kernel` and `scope.md > Who It's For`.

## The Core Journey
1. **Invocation:** The developer or CI environment initiates an analysis via the CLI (`qp analyze <query>` or `qp compare`) or through an autonomous AI agent (`src/agent.ts`).
2. **Execution Plan Inspection:** QueryPilot safely obtains the PostgreSQL execution plan using `EXPLAIN (FORMAT JSON)` without executing data-modifying queries.
3. **Deterministic Plan Analysis:** The plan tree is walked recursively to compute total cost, scan types, row counts, filter conditions, and join algorithms.
4. **Anti-Pattern Flagging:** When an anti-pattern (such as a full table scan or expensive sort) is detected, QueryPilot outputs a clear, color-coded diagnostic with severity (`CRITICAL`, `WARNING`, `INFO`).
5. **AI Suggestion & Rewrite (Optional):** If `--suggest` is enabled, an LLM evaluates the query, the execution plan, and schema context (including parsed `.prisma` schemas) to generate an optimized SQL rewrite and index DDL.
6. **Agent Policy Governance (ArmorIQ / MCP):** When an autonomous agent attempts actions through the MCP server, ArmorIQ verifies cryptographic CSRG intent tokens against `armoriq.yaml`. Read-only plan inspection (`explain_query`) is authorized, while destructive actions (`apply_index`) are blocked.
7. **CI Regression Gate:** In CI mode, plan costs are compared against `.baseline.json`. If execution cost regresses by more than the configured threshold (default 20%), the exit code is set to 1 and a GitHub-flavored Markdown PR summary is generated.

## Screens and Layout
QueryPilot provides three interaction surfaces:
1. **Interactive Terminal CLI (`qp` / `src/index.ts`):** 
   - Visual ASCII/Unicode execution plan tree with indentation.
   - Colored severity tags (`[CRITICAL]`, `[WARNING]`, `[INFO]`).
   - Clean summary boxes showing total estimated cost, actual execution time, and recommendations.
2. **Model Context Protocol (MCP) Streamable HTTP Server (`:3333`):**
   - Standardized JSON-RPC tool endpoints (`explain_query`, `apply_index`).
   - Constant-time Bearer token authorization header validation.
3. **CI Markdown PR Comment Generator (`qp report`):**
   - Formatted Markdown tables detailing query name, baseline cost, current cost, percentage regression, and status (`PASS` / `REGRESSION DETECTED`).

## Look and Feel
- **Terminal Aesthetics:** Clean, modern developer experience using ANSI colors: Cyan for plan nodes, Green for fast index scans, Yellow for warnings, Red for critical sequential scans, and Dim gray for metadata.
- **Copy Tone:** Direct, technical, informative, and authoritative—explaining *why* a query is slow and *exactly* how to fix it without fluff.

## Features and Behavior

### 1. Deterministic Plan Analyzer
Walks the PostgreSQL JSON plan hierarchy.
- Flags sequential scans (`Seq Scan`) on large tables.
- Flags unindexed sorts (`Sort` without index support).
- Flags high-cost nested loop joins and Cartesian products.
- Computes aggregated plan metrics (total cost, startup cost, plan rows, plan width).

### 2. Baseline Comparison & CI Regression Gating
- Captures baseline snapshots into `.baseline.json`.
- Compares current execution plan costs against stored baseline metrics.
- Configurable regression threshold (default 20%).
- Exits with status code `1` on regression to halt failing CI pipelines.

### 3. AI-Powered Query Rewrites & Schema Context
- Integrates with Groq (Llama 3.1 70B), Gemini 2.0 Flash, or OpenAI GPT-4o.
- Passes table schema and `.prisma` definitions to the LLM.
- Produces copy-pasteable SQL rewrites and exact `CREATE INDEX` DDL statements.

### 4. ArmorIQ Zero-Trust Governance & MCP Server
- Operates an MCP server over Streamable HTTP exposing database inspection tools.
- Evaluates agent intents against `armoriq.yaml` zero-trust policies.
- Mints and validates cryptographic CSRG intent tokens before executing any tool.
- Proves zero-trust enforcement by approving read-only diagnostics while blocking schema mutations.

### 5. Automated PR Markdown Reporting
- Formats analysis outputs into GitHub-flavored Markdown tables.
- Emits actionable summary reports suitable for automated GitHub Actions PR comments.

## States and Boundaries
- **Normal CLI Execution:** Connects to PostgreSQL via `DATABASE_URL`, executes `EXPLAIN`, displays visual tree and analysis.
- **Missing Database URL State:** Gracefully warns user and provides guidance on setting `DATABASE_URL` in `.env`.
- **Offline / Mock Mode:** Allows parsing sample JSON plan files directly from disk without requiring an active PostgreSQL instance.
- **ArmorIQ Policy Denied State:** Emits clear security log: `[ArmorIQ POLICY BLOCKED] Unauthorized tool execution: apply_index`.

## Product Decisions
- **Decision 1: Zero direct schema writes in PoC.**  
  *Rationale:* Safety first. An automated database tool must earn developer trust. We output SQL DDL and verify mutations are blocked by policy rather than executing destructive writes autonomously.
- **Decision 2: Deterministic static analysis first, LLMs second.**  
  *Rationale:* Static analysis provides instant, deterministic, zero-cost feedback on obvious anti-patterns, while LLMs are reserved for high-value query rewrites.
- **Decision 3: Standalone `.prisma` AST parsing without Prisma client dependency.**  
  *Rationale:* Developers can run QueryPilot directly in lightweight CI environments or Docker containers without installing heavyweight Prisma client binaries or generating client code.
