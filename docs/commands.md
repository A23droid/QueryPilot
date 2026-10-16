# QueryPilot CLI Command Reference

This file documents every `qp` CLI command: what it does, how to invoke it, options,
expected output, and example invocations.

---

## Table of Contents

1. [Install & Setup](#install--setup)
2. [Global Command Inventory](#global-command-inventory)
3. [Command: `analyze <file>`](#command-analyze-file)
4. [Command: `optimize <file>`](#command-optimize-file)
5. [Command: `benchmark <file>`](#command-benchmark-file)
6. [Command: `baseline save <file>`](#command-baseline-save-file)
7. [Command: `compare <file>`](#command-compare-file)
8. [Command: `prisma <file>`](#command-prisma-file)
9. [npm Scripts](#npm-scripts)
10. [CI Workflow](#ci-workflow)
11. [Exit Codes](#exit-codes)
12. [Troubleshooting](#troubleshooting)

---

## Install & Setup

```bash
# Install dependencies
npm install

# Type-check
npm run typecheck

# Build to dist/ (required before `qp` works globally)
npm run build   # → npx tsc --outDir dist

# Link `qp` to your PATH globally
npm link        # → makes `qp` available everywhere

# Environment
# Create .env with DATABASE_URL (not committed):
#   DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
```

**Local (no install needed):**

```bash
npx tsx src/index.ts <command> <args>
# or via npm scripts:
npm run <script-name> -- <args>
```

---

## Global Command Inventory

| Command | Action | Needs DB | Output Type |
|---------|--------|----------|-------------|
| `qp analyze <file>` | Run EXPLAIN, print plan tree + findings | Yes | Coloured plan tree + findings list |
| `qp optimize <file>` | Plan tree + prioritized action items with SQL suggestions | Yes | Coloured plan tree + numbered action items |
| `qp benchmark <file>` | Run query N times, report latency percentiles | Yes | Stats table (min/mean/p50/p95/p99/max) |
| `qp baseline save <file>` | Save current EXPLAIN plan as `.baseline.json` snapshot | Yes | Success message with saved path |
| `qp compare <file>` | Diff current plan vs baseline, flag regressions | Yes | Coloured diff + regression banner |
| `qp prisma <file>` | Parse `.prisma` schema, print models/fields/relations | No | Model tree + optional SQL output |

---

## Command: `analyze <file>`

**Purpose:** Run `EXPLAIN (FORMAT JSON)` on a SQL file and print a colour-coded
execution plan tree plus optimization findings.

**CLI:**
```bash
qp analyze <file>
# or via npm script:
npm run analyze -- <file>
```

**Options:** none

**What it does:**
1. Reads the SQL file from disk
2. Runs `EXPLAIN (FORMAT JSON) <sql>` against Postgres
3. Prints a recursive, indented plan tree (Node Type, cost, rows, index cond, filters)
4. Runs `analyzePlan()` to detect anti-patterns (Seq Scan, Sort, high cost, etc.)
5. Prints severity-coloured findings (CRITICAL / WARNING / INFO)
6. Ends with "No performance issues detected" if nothing found

**Example output:**

```
Analyzing queries/report.sql
✔ EXPLAIN complete

Execution Plan
──────────────────────────────────────────────────────────────────────────────
└─ Hash Join on "orders"
   cost=12500.00  rows=50000
      index cond: orders.customer_id = customers.id
      filter: customers.created_at > '2024-01-01'
   └─ Seq Scan on "orders"
      cost=10000.00  rows=50000
   └─ Hash
      cost=2500.00  rows=10000
      └─ Seq Scan on "customers"
         cost=1500.00  rows=10000

Optimization Findings (3)
──────────────────────────────────────────────────────────────────────────────

✖ CRITICAL   Sequential scan on 'orders' estimated 50,000 rows
   Suggestion: Consider: CREATE INDEX ON orders (<filtered_column>);
   Or use a covering index if you SELECT few columns.

⚠ WARNING   Node 'Hash Join' has high estimated cost (12500)
   Suggestion: Run EXPLAIN ANALYZE to compare estimated vs actual rows.

ℹ INFO    Sequential scan on 'customers' (10000 rows — acceptable for small tables)
```

**Source:** `src/actions/analyze.ts`

---

## Command: `optimize <file>`

**Purpose:** Like `analyze`, but frames findings as numbered, actionable items
with concrete SQL suggestions highlighted in code blocks.

**CLI:**
```bash
qp optimize <file>
# or via npm script:
npm run optimize -- <file>
```

**Options:** none

**What it does:**
1. Runs EXPLAIN and prints the plan tree (same as `analyze`)
2. Runs `analyzePlan()` to get findings sorted by severity
3. Prints numbered action items: severity badge + message + suggestion
4. Suggestions starting with CREATE/SELECT/ANALYZE are highlighted green
5. Prints a summary: "X critical, Y warnings, Z info"
6. Exit code = 2 if critical findings, 1 if warnings only, 0 if clean

**Example output:**

```
Analyzing queries/slow.sql for optimizations
✔ Plan retrieved

Execution Plan
──────────────────────────────────────────────────────────────────────────────
└─ Seq Scan on "orders"
   cost=50000.00  rows=100000

Optimization Action Items (1 total)
──────────────────────────────────────────────────────────────────────────────

  1. CRITICAL   Sequential scan on 'orders' estimated 100,000 rows
     CREATE INDEX ON orders (customer_id);

  Summary: 1 critical

```

**Exit codes:** 0 clean / 1 warnings / 2 critical

**Source:** `src/actions/optimize.ts`

---

## Command: `benchmark <file>`

**Purpose:** Run a SQL query N times, measure wall-clock latency per run, and
print min/mean/p50/p95/p99/max statistics plus individual run timings.

**CLI:**
```bash
qp benchmark <file> [--runs N]
# or via npm script:
npm run benchmark -- <file>
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-r, --runs <number>` | Number of benchmark runs | `10` |

**What it does:**
1. Reads SQL file
2. Runs `pool.query()` N times, timing each with `performance.now()`
3. Computes min, max, mean, p50, p95, p99
4. Prints a stats table with colour-coded latencies (green <1ms, yellow <100ms, red >100ms)
5. Prints individual run timings compactly

**Example output:**

```
Benchmarking queries/report.sql × 10 runs
✔ Ran 10 queries

Benchmark Results
────────────────────────────────────────────
  runs   10
  min    12.3 ms
  mean   45.7 ms
  p50    42.1 ms
  p95    78.3 ms
  p99    150.0 ms
  max    150.0 ms

Individual runs (ms):
  #1  12.3 ms
  #2  45.0 ms
  #3  42.1 ms
  #4  78.3 ms
  #5  150.0 ms
  ...
```

**Source:** `src/actions/benchmark.ts`

---

## Command: `baseline save <file>`

**Purpose:** Save the current EXPLAIN plan as a `.baseline.json` snapshot next to
the SQL file. Intended to run on the main branch in CI so PRs can compare against it.

**CLI:**
```bash
qp baseline save <file> [--ref <label>]
# or via npm script: (no direct script — use tsx directly)
npx tsx src/index.ts baseline save <file>
```

**Options:**

| Option | Description |
|--------|-------------|
| `--ref <label>` | Git ref or label (informational, e.g. `main@abc123`) |

**What it does:**
1. Runs EXPLAIN on the SQL file
2. Writes a JSON snapshot to `queries/<name>.baseline.json`
3. Snapshot contains: `capturedAt` (ISO timestamp), `ref`, `plan`, `totalCost`
4. Prints success message with saved path and cost

**Baseline file path derivation:**
- Input: `queries/report.sql` → Output: `queries/report.baseline.json`

**Example output:**

```
Saving baseline for queries/report.sql
✔ Baseline saved → queries/report.baseline.json (cost: 12500.00)
```

**Source:** `src/actions/compare.ts` → `saveBaselineAction()`

**Baseline I/O helpers:** `src/utils/baseline.ts` (`saveBaseline`, `loadBaseline`, `diffCost`)

---

## Command: `compare <file>`

**Purpose:** Load a saved baseline, run EXPLAIN on the current SQL, diff the total
cost, and flag regressions (>20% increase). Exits non-zero on regression.

**CLI:**
```bash
qp compare <file>
# or via npm script:
npm run compare -- <file>
```

**Options:** none

**What it does:**
1. Loads `.baseline.json` next to the SQL file (fails fast if missing)
2. Runs EXPLAIN on current SQL and prints plan tree
3. Computes cost diff (baseline vs current)
4. Prints a colour-coded comparison table
5. Prints regression/improvement banner or "no significant change"
6. If regression: also prints contributing optimization findings
7. Exit code = 1 if regression detected

**Example output (no regression):**

```
Comparing queries/report.sql against baseline
✔ Comparison ready

Current Plan
──────────────────────────────────────────────────────────────────────────────
└─ Index Scan on "orders" using orders_customer_id_idx
   cost=500.00  rows=500

Cost Comparison
──────────────────────────────────────────────────────────────────────────────
  Baseline:   (2026-10-16T18:42:00Z)  cost = 12500.00
  Current:                         cost = 500.00
  Delta:     ↓ 12000.00 (-96.0%)

✔ IMPROVEMENT: cost decreased by 96.0%
```

**Example output (regression):**

```
Comparing queries/report.sql against baseline
✖ REGRESSION: cost increased by 25.0% (threshold: 20%)

Optimization issues contributing to this regression:
  • [critical] Sequential scan on 'orders' estimated 50,000 rows
```

**Regression threshold:** 20% cost increase (`REGRESSION_THRESHOLD_PCT` in `compare.ts`)

**Source:** `src/actions/compare.ts` → `compareQuery()`

---

## Command: `prisma <file>`

**Purpose:** Parse a Prisma schema (`.prisma`) file and extract model definitions:
fields, types, attributes, and relations. Optionally generates SQL.

**CLI:**
```bash
qp prisma <file> [--sql] [--analyze <model>]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--sql` | Print generated `CREATE TABLE` / `SELECT *` SQL for each model |
| `--analyze <model>` | Run EXPLAIN on a generated `SELECT * ... LIMIT 1` for the given model |

**What it does:**
1. Reads and strips comments from the `.prisma` file
2. Extracts `model`, `datasource`, and `generator` blocks via regex
3. For each model: prints field names, types, optional/list modifiers, relations
4. Detects relation kinds: `belongs-to`, `has-one`, `has-many`
5. With `--sql`: prints `CREATE TABLE IF NOT EXISTS` and field SQL per model
6. With `--analyze <model>`: runs `EXPLAIN (FORMAT JSON)` on `SELECT ... LIMIT 1`

**Example output:**

```
Parsed 3 model(s) from queries/schema.prisma

model  User
  fields: 4
  relations: 1
    id Int
    email String
    name String [optional]
    posts Post [list]
    relation posts → Post (has-many)
  SQL:
CREATE TABLE IF NOT EXISTS "User" (
  "id" INTEGER PRIMARY KEY,
  "email" TEXT UNIQUE NOT NULL,
  "name" TEXT,
  PRIMARY KEY ("id")
);

model  Post
  fields: 7
  relations: 2
    id Int
    title String
    content String [optional]
    published Boolean
    authorId Int [optional]
    author User [optional]
    comments Comment [list]
    relation authorId → User (belongs-to)
    relation comments → Comment (has-many)
  SQL:
CREATE TABLE IF NOT EXISTS "Post" (
  "id" INTEGER PRIMARY KEY,
  "title" TEXT NOT NULL,
  ...
);

  datasource: postgresql
  generator: prisma-client-js
```

**Supported Prisma types:** Int, String, Boolean, Float, DateTime, Json, Bytes, BigInt, Decimal → mapped to SQL types (INTEGER, TEXT, BOOLEAN, DOUBLE PRECISION, TIMESTAMPTZ, JSONB, BYTEA, BIGINT, DECIMAL).

**Relation detection:**
- `@relation(fields: [...], references: [...])` → `belongs-to`
- Field type is a list (`Post[]`) with `@relation` → `has-many`
- Field type is a list without `@relation` → `has-many`
- Otherwise → `has-one`

**Source:**
- Parser: `src/db/prismaParser.ts` (`parsePrismaSchema`, `readPrismaSchema`, `modelToSql`, `modelToSelectSql`)
- CLI wiring: `src/index.ts` (`prisma <file>` command)

---

## npm Scripts

Defined in `package.json`:

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `tsx src/index.ts` | Run CLI via tsx (no build step) |
| `build` | `tsc --outDir dist` | Compile TypeScript to `dist/` |
| `typecheck` | `tsc --noEmit` | Type-check without emitting |
| `analyze` | `tsx src/index.ts analyze` | Run `analyze` command |
| `optimize` | `tsx src/index.ts optimize` | Run `optimize` command |
| `benchmark` | `tsx src/index.ts benchmark` | Run `benchmark` command |
| `compare` | `tsc --noEmit` (n/a — no compare script) | — |
| `test` | `vitest run` | Run vitest test suite |

**Note:** There are no dedicated npm scripts for `baseline save`, `compare`, or `prisma`.
Use `npx tsx src/index.ts <command>` or the globally-linked `qp` for those.

**Usage examples:**
```bash
npm run analyze   -- ./queries/report.sql
npm run optimize  -- ./queries/slow.sql
npm run benchmark -- ./queries/report.sql --runs 20
```

---

## CI Workflow

Located at `.github/workflows/querypilot.yml`.

**Pipeline stages:**
1. **Setup** — checkout repo, set up Node.js, install dependencies
2. **Postgres** — spin up PostgreSQL service container on port 5432
3. **Seed** — run schema/seed SQL against the test database
4. **Analyze** — run `qp analyze queries/report.sql` and capture output
5. **Compare** — run `qp compare queries/report.sql`; if exit code != 0, post a PR comment with regression details

**PR comment:** When a regression is detected, GitHub Actions posts a comment on the PR with:
- Baseline vs current cost
- Percentage change
- Optimization findings contributing to the regression

---

## Exit Codes

| Code | Meaning | Commands |
|------|---------|----------|
| 0 | Success / clean | all |
| 1 | Warning-level issue or regression detected | `optimize` (warnings), `compare` (regression), `benchmark`, `baseline save`, `analyze` (errors) |
| 2 | Critical-level issue detected | `optimize` (critical findings) |

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|--------------|-----|
| `qp: command not found` | `dist/` not built or `npm link` not run | Run `npm run build` then `npm link` |
| `DATABASE_URL is missing from .env` | No `.env` file or missing `DATABASE_URL` | Create `.env` with `DATABASE_URL=postgresql://...` |
| `No baseline found` | `.baseline.json` doesn't exist next to SQL file | Run `qp baseline save <file>` first on main branch |
| TypeScript errors on build | `src/db/prismaParser.ts` had type errors | Run `npm run typecheck` to see current state |
| `qp prisma` prints nothing / 0 models | Schema file path wrong or no `model` blocks | Verify file path exists and contains `model X { ... }` blocks |

**Verify build is current:**
```bash
npm run typecheck && npm run build
```

---

## File Layout (reference)

```
D:\querypilot\
├── package.json              ← bin: qp → dist/index.js, scripts
├── tsconfig.json             ← strict, nodenext, outDir: ./dist
├── .env                      ← DATABASE_URL (gitignored, not committed)
├── .env.example              ← template for onboarding (TODO)
├── OBJECTIVE.md              ← project pitch
├── PROGRESS.md               ← session notes & next steps
├── AGENTS.md                 ← agent instructions
├── docs/
│   └── commands.md           ← this file
├── src/
│   ├── index.ts              ← CLI entry point (commander + all commands)
│   ├── actions/
│   │   ├── analyze.ts        ← qp analyze
│   │   ├── benchmark.ts      ← qp benchmark
│   │   ├── compare.ts        ← qp baseline save / qp compare
│   │   └── optimize.ts       ← qp optimize
│   ├── db/
│   │   ├── connection.ts     ← pg Pool + DATABASE_URL
│   │   ├── explain.ts        ← EXPLAIN (FORMAT JSON) wrapper
│   │   └── prismaParser.ts   ← .prisma schema parser
│   └── utils/
│       ├── planPrinter.ts    ← coloured plan tree renderer
│       ├── planAnalyzer.ts   ← static analysis rules (findings)
│       └── baseline.ts       ← snapshot I/O + cost diff
├── queries/
│   ├── report.sql            ← sample SQL query
│   ├── slow.sql              ← bad query for demos
│   ├── schema.prisma         ← sample Prisma schema
│   └── report.baseline.json  ← saved baseline snapshot
└── .github/
    └── workflows/
        └── querypilot.yml    ← CI pipeline
```
