# QueryPilot CI — Catch Slow Queries Before They Ship

A performance-testing layer for AI-generated and ORM-generated database code.

## The Problem
Developers increasingly rely on AI-generated and ORM-generated database code. These tools often produce queries that work correctly but perform poorly at scale. Performance regressions slip into production because:
- No automated performance testing in CI
- Execution plans aren't reviewed
- Benchmarks aren't run against realistic datasets

## The Solution
QueryPilot CI integrates into your GitHub workflow to catch database performance regressions before they ship.

### Workflow
1. A developer opens a GitHub pull request that changes a Prisma query (or any SQL)
2. An agent inspects the code and runs the affected query against a controlled PostgreSQL dataset
3. It compares execution plans, query results, and benchmark timings against the baseline
4. It posts a GitHub comment explaining the regression and proposing a fix, with measured evidence

### Current Capabilities
- **SQL analysis**: `qp analyze <file>` — runs `EXPLAIN (FORMAT JSON)` and prints a color-coded plan tree with optimization findings
- **Optimization suggestions**: `qp optimize <file>` — prioritized action items with severity badges (CRITICAL/WARNING/INFO)
- **Benchmarking**: `qp benchmark <file> [--runs N]` — latency percentiles (p50/p95/p99)
- **Prisma schema parsing**: `qp prisma <file> [--sql] [--analyze <model>]` — parses `.prisma` files, extracts models/fields/relations, generates `CREATE TABLE`/`SELECT` SQL
- **Baseline management**: `qp baseline save <file> [--ref ]` — saves plan snapshot; `qp compare <file>` — diffs vs baseline, exits non-zero on regression (>20% cost increase)
- **CI pipeline**: `.github/workflows/querypilot.yml` — GitHub Actions with Postgres service, schema seeding, analyze + compare steps, PR comment on regression

### The Pitch
**Catch database performance regressions in AI-generated and ORM-generated code before they reach production.**