---
doc: spec
status: approved
---

# QueryPilot — Technical Spec

Catch database performance regressions and govern autonomous database agents before they reach production.

## How This Works, In Plain Language
QueryPilot acts as an intelligent, guarded bridge between developers, autonomous AI agents, and PostgreSQL databases.

When you pass a SQL query to QueryPilot, it requests an execution plan from PostgreSQL using `EXPLAIN (FORMAT JSON)` without executing any data-modifying queries. It then deterministically walks the plan tree to identify performance bottlenecks (like unindexed table scans or expensive in-memory sorts). If enabled, it asks an LLM (Groq, OpenAI, or Gemini) to recommend query rewrites and index definitions.

When an autonomous AI agent interacts with the database via the Model Context Protocol (MCP), QueryPilot acts as a zero-trust policy proxy: it checks with ArmorIQ to ensure the agent holds a valid cryptographic intent token. Safe read-only plan inspections are approved, while dangerous mutations (like dropping tables or running unapproved DDL) are immediately blocked.

In CI pipelines, QueryPilot captures plan cost snapshots in `.baseline.json` and fails pull requests if execution costs exceed a defined regression threshold.

## The Core Journey Through the System
1. **Developer Invokes CLI:**  
   `qp analyze "SELECT * FROM orders WHERE status = 'pending';"`  
   PRD ref: `prd.md > The Core Journey` (Step 1).
2. **Database Execution Plan:**  
   `src/db/explain.ts` issues `EXPLAIN (FORMAT JSON)` to PostgreSQL via `pg.Pool`.
3. **Deterministic Static Analysis:**  
   `src/utils/planAnalyzer.ts` recursively inspects plan nodes, identifying `Node Type: Seq Scan` on large tables and classifying it as `CRITICAL`.
4. **Visual Terminal Render:**  
   `src/utils/planPrinter.ts` formats the node hierarchy into an indented ASCII/ANSI tree with cost metrics.
5. **LLM Query Optimization (Optional):**  
   `src/llm/suggest.ts` feeds the query and plan into Groq/OpenAI/Gemini to produce rewritten SQL and `CREATE INDEX` recommendations.
6. **Agent Zero-Trust Gating (MCP & ArmorIQ):**  
   `src/agent.ts` requests a tool call to `explain_query`. `src/security/armoriq.ts` evaluates policy against `armoriq.yaml` and issues a CSRG token. The MCP server (`src/mcp/server.ts`) validates the token and permits execution. If the agent calls `apply_index`, ArmorIQ blocks execution.
7. **CI Regression Verification:**  
   `src/actions/compare.ts` computes the percentage diff against `.baseline.json`. If diff > 20%, CI fails and `src/actions/report.ts` outputs a Markdown table for PR comments.

## Stack
- **Language & Runtime:** TypeScript 5.0+, Node.js 18+ ([Node.js Docs](https://nodejs.org/))
- **Database Driver:** `pg` (v8.11+) ([node-postgres Docs](https://node-postgres.com/))
- **CLI Framework:** `commander` (v12.0+) ([Commander.js Docs](https://github.com/tj/commander.js))
- **Styling / Formatting:** `chalk` (v4.1.2) for terminal ANSI colorization
- **AI Integration:** `@google/genai`, `groq-sdk`, `openai`
- **Security & Agent Control Plane:** ArmorIQ Policy Engine (`armoriq.yaml`) with Model Context Protocol (MCP) Streamable HTTP transport
- **Testing:** `vitest` (v5.0+) with 41 passing unit and integration tests

## Where It Runs and How Someone Tries It
- **Runtime:** Local Node.js process / terminal CLI, CI/CD pipeline (GitHub Actions), and MCP Streamable HTTP service on port 3333.
- **Prerequisites:** Node.js 18+, access to a PostgreSQL instance (or Neon serverless database) configured via `.env`.
- **Start Commands:**
  ```bash
  # Run unit test suite (41 tests passing)
  npm test

  # Build TypeScript project
  npm run build

  # Run deterministic plan analysis on a query
  npx ts-node src/index.ts analyze "SELECT * FROM users WHERE LOWER(email) = 'test@example.com';"

  # Run analysis with AI rewrite suggestions
  npx ts-node src/index.ts analyze "SELECT * FROM users WHERE LOWER(email) = 'test@example.com';" --suggest

  # Run baseline regression comparison in CI
  npx ts-node src/index.ts compare

  # Start the protected MCP server
  npx ts-node src/mcp/server.ts
  ```

## Look and Feel
- **Terminal Palette:** 
  - Cyan (`#00FFFF`) for plan node headers and query targets.
  - Green (`#00FF00`) for index scans and passing baseline checks.
  - Yellow (`#FFFF00`) for warning alerts and moderate cost jumps.
  - Red (`#FF0000`) for critical full-table scans, query regressions, and ArmorIQ policy blocks.
- **Tone:** Concise, developer-first, and highly structured with scannable diagnostics.

## Components

### 1. Plan Analyzer (`src/utils/planAnalyzer.ts`)
Walks PostgreSQL JSON plan trees recursively. Emits structured diagnostics (`CRITICAL`, `WARNING`, `INFO`) and cost breakdowns.  
PRD ref: `prd.md > 1. Deterministic Plan Analyzer`.

### 2. Plan Visualizer (`src/utils/planPrinter.ts`)
Renders color-coded, indented execution trees in the terminal showing node types, row estimates, filter conditions, and cost fractions.  
PRD ref: `prd.md > Screens and Layout`.

### 3. Baseline & CI Comparator (`src/actions/compare.ts`, `src/utils/baseline.ts`)
Saves baseline plan cost snapshots to `.baseline.json`, compares pull request queries against baselines, and triggers exit code 1 on regressions.  
PRD ref: `prd.md > 2. Baseline Comparison & CI Regression Gating`.

### 4. LLM Suggestion Engine (`src/llm/suggest.ts`)
Interfaces with Groq, Gemini, or OpenAI to synthesize concrete SQL rewrites and exact index DDL based on AST plan context.  
PRD ref: `prd.md > 3. AI-Powered Query Rewrites & Schema Context`.

### 5. Prisma AST Parser (`src/db/prismaParser.ts`)
Lightweight parser for `.prisma` files that extracts models, relations, and fields to simulate query schemas without Prisma runtime code generation.  
PRD ref: `prd.md > 3. AI-Powered Query Rewrites & Schema Context`.

### 6. ArmorIQ Security Guard & MCP Server (`src/security/armoriq.ts`, `src/mcp/server.ts`, `src/agent.ts`)
Enforces zero-trust cryptographic intent tokens over standard MCP JSON-RPC endpoints. Approves read-only plan queries and denies schema alterations.  
PRD ref: `prd.md > 4. ArmorIQ Zero-Trust Governance & MCP Server`.

### 7. Markdown PR Reporter (`src/actions/report.ts`, `src/utils/formatMarkdown.ts`)
Generates GitHub-flavored Markdown tables for CI automated pull request commentary.  
PRD ref: `prd.md > 5. Automated PR Markdown Reporting`.

## Data Model
- **PlanNode Interface:**
  - `Node Type`: string (`Seq Scan`, `Index Scan`, `Hash Join`, `Sort`, etc.)
  - `Total Cost`: number (PostgreSQL cost units)
  - `Startup Cost`: number
  - `Plan Rows`: number
  - `Filter`: optional string
  - `Plans`: optional child `PlanNode[]`
- **Baseline Snapshot (`.baseline.json`):**
  - Record mapping query signatures to `{ cost: number, executionTime: number, timestamp: string }`.
- **ArmorIQ Policy Schema (`armoriq.yaml`):**
  - Defines agent roles, permitted tool names (`explain_query`), and denied tool actions (`apply_index`).

## File Structure
```
querypilot/
├── armoriq.yaml                  # ArmorIQ zero-trust security policy
├── devpost/                      # Devpost Learn Hackathon planning artifacts
│   ├── learner-profile.md
│   ├── scope.md
│   ├── prd.md
│   ├── spec.md
│   ├── checklist.md
│   └── app-map.html
├── src/
│   ├── actions/
│   │   ├── analyze.ts            # CLI analyze action
│   │   ├── analyzeAuthorized.ts  # ArmorIQ-gated analyze action
│   │   ├── benchmark.ts          # Query benchmarking engine
│   │   ├── compare.ts            # Baseline regression comparison
│   │   ├── optimize.ts           # Autonomous optimization runner
│   │   └── report.ts             # Markdown report generation
│   ├── db/
│   │   ├── connection.ts         # pg connection pool management
│   │   ├── explain.ts            # EXPLAIN JSON execution
│   │   ├── explainAuthorized.ts  # Token-authorized EXPLAIN execution
│   │   └── prismaParser.ts       # Standalone Prisma schema parser
│   ├── llm/
│   │   └── suggest.ts            # LLM query rewrite suggestions
│   ├── mcp/
│   │   └── server.ts             # Model Context Protocol HTTP server
│   ├── security/
│   │   └── armoriq.ts            # ArmorIQ zero-trust verification
│   ├── utils/
│   │   ├── baseline.ts           # Baseline snapshot persistence
│   │   ├── formatMarkdown.ts     # Markdown table formatting
│   │   ├── planAnalyzer.ts       # Deterministic plan AST analyzer
│   │   └── planPrinter.ts        # Color-coded plan visualizer
│   ├── agent.ts                  # Autonomous agent diagnosis loop
│   └── index.ts                  # CLI entrypoint (qp)
├── tests/                        # Vitest unit & integration test suite (41 tests)
├── package.json
└── tsconfig.json
```
