# QueryPilot — Development Progress Log

---

## Session 1 — CLI & Database Infrastructure

- **CLI Framework**: Implemented using Commander.js.
- **TypeScript Foundation**: Strict mode, ES modules (`nodenext`), modern target.
- **PostgreSQL Pool**: Database connectivity using `pg` with connection pooling and query plan wrappers.
- **Initial Stubs**: Created core command interfaces (`analyze`, `optimize`, `benchmark`).

---

## Session 2 — Analysis Engine & Baseline Regressions

- **Plan Visualizer (`src/utils/planPrinter.ts`)**:
  - Recursively prints PostgreSQL `EXPLAIN (FORMAT JSON)` into an intelligible, color-coded execution tree.
  - Highlights critical nodes (Seq Scan, Hash Join, Sort) vs. fast paths (Index Scan, Index Only Scan).
- **Plan Static Analyzer (`src/utils/planAnalyzer.ts`)**:
  - Deterministically inspects plan trees for anti-patterns:
    - High-cost nodes (>1000 cost units).
    - Sequential scans on large tables.
    - Sorting operations without covering indexes.
    - Dangerous nested loops without inner index scans.
- **Benchmarking Engine (`src/actions/benchmark.ts`)**:
  - Runs queries across configurable iterations.
  - Computes latency percentiles ($p50$, $p95$, $p99$, min, mean, max).
- **Baseline Snapshotting & Regression Detection (`src/actions/compare.ts`)**:
  - `qp baseline save <file>` saves execution plan snapshots (`.baseline.json`).
  - `qp compare <file> --threshold <pct>` diffs current cost against baseline and exits with status 1 on regression.

---

## Session 3 — Prisma Parser & GitHub Actions CI

- **Prisma Schema Parser (`src/db/prismaParser.ts`)**:
  - Custom AST parser extracting models, fields, types, and relations from `.prisma` schemas without needing `@prisma/client`.
  - Generates DDL (`CREATE TABLE`) and representative `SELECT` queries for automated testing.
- **Automated CI Reporting (`src/actions/report.ts`)**:
  - Generates GitHub-flavored Markdown tables for automated PR comment generation.
- **GitHub Actions Workflow (`.github/workflows/querypilot.yml`)**:
  - Automated CI test pipeline running on pull requests with database seeding.

---

## Session 4 — Model Context Protocol (MCP) Integration

- **MCP Server (`src/mcp/server.ts`)**:
  - Built with `@modelcontextprotocol/sdk` (v1) using the Streamable HTTP transport.
  - Exposes database operations as standardized MCP tools:
    - `explain_query`: Safely inspects PostgreSQL execution plans.
    - `benchmark_query`: Measures query performance percentiles.
    - `apply_index`: DDL index creation (governed by authorization).
  - Protected with constant-time Bearer token authorization (`QUERY_PILOT_MCP_TOKEN`).
  - Compatible with Cloudflare Tunnel for secure remote agent connectivity.

---

## Session 5 — ArmorIQ Zero-Trust Security & Autonomous Agent

- **ArmorIQ Control Plane Registration (`armoriq.yaml`)**:
  - Registered agent `querypilot` and MCP server `querypilot-db`.
  - Enforced strict whitelist security policy:
    - **Allowed**: `querypilot-db.explain_query`.
    - **Blocked / Denied**: `querypilot-db.apply_index`.
- **Security Bridge (`src/security/armoriq.ts`)**:
  - Implements cryptographic Intent Token verification with CSRG Merkle proofs via `@armoriq/sdk`.
  - Intercepts autonomous tool invocations, validating each against the control plane policy before execution.
- **Autonomous Agent Loop (`src/agent.ts`)**:
  - Implemented end-to-end autonomous agent workflow:
    1. Agent identifies slow query.
    2. Requests `explain_query` via ArmorIQ $\rightarrow$ **ALLOWED ✅**.
    3. Analyzes query plan bottlenecks using Groq / Llama LLM.
    4. Attempts remediation via `apply_index` $\rightarrow$ **BLOCKED ⛔** by ArmorIQ.
- **Terminal Markdown Formatter (`src/utils/formatMarkdown.ts`)**:
  - Formats LLM suggestions natively for the terminal with clean bullet cards, bold headers, and styled code blocks, preventing broken table wrapping.

---

## Session 6 — Terminal Beautification, SCI Carbon Metrics & `qp watch` Live ORM Interceptor

- **Chalk & Marked Terminal Beautification**:
  - Re-architected markdown rendering in terminal using `chalk` and box-drawing characters for clean reports, tables, alerts, and plan metrics (`qp report <file>` and `--raw` mode).
- **Software Carbon Intensity (SCI) Estimator (`src/utils/carbon.ts`)**:
  - Implemented carbon footprint calculations following the Green Software Foundation SCI specification.
  - Estimates CPU time, energy consumption (kWh), and carbon emissions ($g\text{ CO}_2e$) per 10,000 executions.
  - Integrated carbon impact tables and regression warnings into reports, baselines, and watch dashboard.
- **Live ORM Interceptor & Telemetry Dashboard (`qp watch`)**:
  - Built HTTP telemetry receiver (`src/watch/server.ts`) listening on port 7432 for runtime query events from ORMs (Prisma, Drizzle, TypeORM, SQLAlchemy).
  - Runs asynchronous, non-blocking `EXPLAIN` analysis without imposing any latency overhead on the application.
  - Performs instant baseline regression detection against existing snapshots (`.baseline.json`).
  - Terminal live dashboard (`src/watch/display.ts`) streaming real-time colored rows, execution timing, cost delta, node type, and carbon footprint with session summaries upon exit.
- **Middleware Integration (`src/middleware/prismaPlugin.ts`)**:
  - Exported `attachQueryPilot(prisma, options)` middleware attaching to Prisma's `$on('query')` event hook with async fire-and-forget telemetry.
  - Added multi-ORM support and generic HTTP endpoint (`POST /query`).
- **Comprehensive Examples & Demos**:
  - `examples/watch-demo.ts`: Interactive 20-query simulation featuring index scans, seq scans, regressions, and N+1 query bursts.
  - `examples/prisma-app-example.ts`: Reference integration for Next.js/Express Prisma client.
  - `examples/python-sqlalchemy-example.py`: Reference hook for SQLAlchemy's `after_cursor_execute`.
- **Testing & Verification**:
  - Expanded test suite to 46 passing tests across 9 test suites covering static analysis, baseline diffs, Prisma parsing, carbon calculations, plan formatting, and benchmarks.