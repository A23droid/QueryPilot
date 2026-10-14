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

### The Pitch
**Catch database performance regressions in AI-generated code before they reach production.**