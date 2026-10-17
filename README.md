# QueryPilot 🚀

[![CI](https://github.com/your-org/querypilot/actions/workflows/querypilot.yml/badge.svg)](.github/workflows/querypilot.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Catch slow database queries before they reach production.**  
> A performance-testing and regression-prevention layer for AI-generated and ORM-generated database code.

---

## The Problem

Developers increasingly rely on AI coding assistants and ORMs (Prisma, Drizzle, TypeORM). While these tools write syntactically correct queries fast, they often generate silent performance killers:
- Unindexed table scans on growing tables
- O(n²) nested loop joins
- In-memory sorting and excessive hash builds
- Function-wrapped columns preventing index usage

Because query performance isn't routinely tested in CI, these regressions slip into production until users notice slow response times or your database spikes to 100% CPU.

## The Solution

**QueryPilot** runs in your local development workflow and your CI pipeline to inspect execution plans, benchmark query timings, and fail PRs that cause performance regressions against established baselines.

```
       ┌──────────────────────────────┐
       │   Developer opens a PR with  │
       │     SQL or Prisma changes    │
       └──────────────┬───────────────┘
                      │
                      ▼
       ┌──────────────────────────────┐
       │    QueryPilot CI Pipeline    │
       │  • Runs EXPLAIN (FORMAT JSON)│
       │  • Evaluates anti-patterns   │
       │  • Diffs cost vs baseline    │
       └──────────────┬───────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
  Regression?                  No Regression
        │                           │
        ▼                           ▼
 ❌ Fails PR Check            ✅ Passes PR Check
 Posts detailed breakdown
 with suggested indexes & rewrites
```

---

## Key Features

- 🔍 **Visual Plan Tree**: Recursively renders PostgreSQL `EXPLAIN` execution plans with cost, row count, filter, and index condition highlights.
- ⚡ **Deterministic Static Analyzer**: Flags anti-patterns (Seq Scans on large tables, unindexed sorts, dangerous nested loops) with `CRITICAL`, `WARNING`, and `INFO` badges.
- 🤖 **AI-Powered Query Rewrites**: Optional `--suggest` mode uses Groq (Llama 3.1 70B), Gemini, or OpenAI to propose concrete SQL rewrites and exact index definitions.
- ⏱️ **Latency Benchmarking**: Runs queries over configurable iterations with percentiles ($p50$, $p95$, $p99$, min, mean, max).
- 📐 **Prisma Schema Parser**: Extracts models, fields, and relationships directly from `.prisma` schemas and generates DDL / `EXPLAIN` queries without requiring Prisma client generation.
- 🛡️ **Baseline Regression Detection**: Captures plan snapshots (`.baseline.json`) and flags cost regressions exceeding customizable thresholds (`--threshold <pct>`).
- 📝 **Markdown PR Reports**: Generates formatted markdown tables for automated GitHub Actions PR comments.

---

## Installation

### Global Install
```bash
npm install -g querypilot
# or
npm link
```

### Run without installing (npx)
```bash
npx querypilot --help
```

---

## Quickstart

### 1. Configure Database Connection
Copy the example environment file:
```bash
cp .env.example .env
```

Set your PostgreSQL connection string in `.env`:
```env
DATABASE_URL=postgresql://postgres:secret@localhost:5432/mydb
```

*Need a fast local PostgreSQL instance? Spin one up with Docker:*
```bash
docker run --name qp-postgres \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=mydb \
  -p 5432:5432 -d postgres:16
```

### 2. Analyze a Query
Inspect an execution plan and see performance findings:
```bash
qp analyze queries/report.sql
```

### 3. Get Actionable Optimization Suggestions
```bash
qp optimize queries/slow.sql
```
*To get AI-powered SQL rewrites (requires `GROQ_API_KEY`, `GEMINI_API_KEY`, or `OPENAI_API_KEY`):*
```bash
qp optimize queries/slow.sql --suggest
```

### 4. Benchmark Query Latency
```bash
qp benchmark queries/report.sql --runs 20
```

---

## Command Reference

| Command | Description |
|---|---|
| `qp analyze <file>` | Runs `EXPLAIN (FORMAT JSON)` and outputs the color-coded plan tree with static analysis findings. |
| `qp optimize <file> [--suggest]` | Prints prioritized action items and index suggestions. Exits with code 2 on critical findings, 1 on warnings. |
| `qp benchmark <file> [-r, --runs N]` | Benchmarks query execution time over $N$ runs and prints min/mean/p50/p95/p99/max latency statistics. |
| `qp baseline save <file> [--ref <ref>]` | Saves the query's current execution plan as `<file>.baseline.json` snapshot to commit to git. |
| `qp compare <file> [-t, --threshold pct]` | Diffs the current plan cost against the committed baseline. Exits with code 1 if cost increases beyond threshold (default: 20%). |
| `qp report <file> [-t, --threshold pct]` | Generates clean Markdown documentation of the plan, findings, and baseline diff (ideal for CI PR comments). |
| `qp prisma <file> [--sql] [--analyze <model>]` | Parses `.prisma` schema file, displays models/relations, and optionally generates SQL or analyzes queries. |

Full options and syntax details are documented in [docs/commands.md](docs/commands.md).

---

## CI / GitHub Actions Setup

QueryPilot includes a complete CI workflow template in `.github/workflows/querypilot.yml`.

### Example CI Workflow

```yaml
name: QueryPilot CI

on:
  pull_request:
    paths:
      - "queries/**"
      - "prisma/schema.prisma"

jobs:
  query-check:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: testdb
          POSTGRES_PASSWORD: secret
        ports:
          - 5432:5432
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test

      # Compare against committed baselines
      - name: Detect Query Regressions
        env:
          DATABASE_URL: postgresql://postgres:secret@localhost:5432/testdb
        run: |
          npx querypilot compare queries/report.sql --threshold 15
```

---

## Development & Testing

```bash
# Clone the repository
git clone https://github.com/your-org/querypilot.git
cd querypilot

# Install dependencies
npm install

# Run unit tests (no database required)
npm test

# Type-check TypeScript
npm run typecheck

# Build compiled JavaScript to dist/
npm run build
```

---

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change. Please ensure test coverage passes via `npm test`.

---

## License

[MIT](LICENSE) © 2026 QueryPilot Contributors
