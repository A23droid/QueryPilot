# QueryPilot CI — Progress Log

## Session 1 — Initial Commit

### Core Infrastructure
- **CLI Framework**: Built with Commander.js for command parsing
- **TypeScript Setup**: Strict mode, ES modules, Node.js target
- **Database Connection**: PostgreSQL connection pool via `pg` with `DATABASE_URL` from `.env`

### Implemented Commands (Session 1)

#### `analyze <file>` (stub version)
- Reads SQL from file
- Runs `EXPLAIN (FORMAT JSON)` against PostgreSQL
- Outputs raw JSON query execution plan
- Validates: single SELECT only, no multiple statements

#### `optimize <file>` (stub)
#### `benchmark <file>` (stub)

---

## Session 2 — Core Feature Build-out

### What Changed

#### `analyze <file>` — upgraded
- Now prints a **colour-coded plan tree** using `chalk` instead of raw JSON
- Added **ora spinner** for feedback while waiting on Postgres
- Automatically runs plan analysis and prints optimization findings below the tree

#### `optimize <file>` — implemented
- Runs EXPLAIN and analyses the plan with `planAnalyzer.ts`
- Prints numbered action items with severity badges: `CRITICAL`, `WARNING`, `INFO`
- SQL suggestions are highlighted inline
- Sets exit code 2 (critical), 1 (warning) — CI-friendly

#### `benchmark <file> [--runs N]` — implemented
- Runs the query N times (default: 10) measuring wall-clock time via `performance.now()`
- Computes min / mean / p50 / p95 / p99 / max
- Color-coded: green < 1ms, yellow < 100ms, red ≥ 100ms
- Prints a stat table + individual run timings

#### `baseline save <file> [--ref <ref>]` — NEW
- Runs EXPLAIN and saves the plan + metadata as `<file>.baseline.json`
- The `--ref` flag lets you tag it with a git ref (e.g. `main@abc123`)

#### `compare <file>` — NEW
- Loads the `.baseline.json` sibling file
- Diffs current plan cost vs baseline cost
- Flags regressions > 20% with a red banner and **exits with code 1**
- Exits 0 on no regression or improvement

### New Files

#### `src/utils/planPrinter.ts`
Renders an EXPLAIN JSON plan node recursively as a coloured terminal tree.
- Yellow/red for expensive node types (Seq Scan, Hash, Sort)
- Green for fast paths (Index Scan, Index Only Scan)
- Shows cost, rows, actual times (if ANALYZE mode), filters

#### `src/utils/planAnalyzer.ts`
Static analysis rules that walk the plan tree:
| Rule | Severity |
|---|---|
| Seq Scan on table > 1,000 estimated rows | CRITICAL |
| Seq Scan on small table | INFO |
| Node total cost > 10,000 | WARNING |
| In-memory Sort step | WARNING |
| Nested Loop driving a Seq Scan | CRITICAL |
| Large Hash build (> 50,000 rows) | WARNING |

#### `src/utils/baseline.ts`
- `saveBaseline(file, plan, ref?)` → writes `.baseline.json`
- `loadBaseline(file)` → reads it back
- `diffCost(baseline, plan)` → returns delta + % change

#### `src/db/explain.ts` — updated
- Now supports `{ analyze: true }` option
- When true: uses `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for real timings

#### `.github/workflows/querypilot.yml` — NEW
Full CI pipeline:
1. Spins up Postgres 16 via Docker service
2. Seeds schema + 1,000 users / 5,000 orders
3. Runs `qp analyze` on all `queries/*.sql`
4. Runs `qp compare` against committed baselines
5. Posts a PR comment if regression detected
6. Fails the job with a clear error message

#### `queries/slow.sql` — NEW
Deliberately slow query for demonstration/testing — triggers multiple findings.

### Updated Project Structure
```
src/
├── index.ts                  ← updated (all 5 commands wired)
├── actions/
│   ├── analyze.ts            ← upgraded (pretty tree + findings)
│   ├── benchmark.ts          ← NEW (timing loop, percentiles)
│   ├── optimize.ts           ← NEW (action items with severity)
│   └── compare.ts            ← NEW (baseline diff, regression detection)
├── db/
│   ├── connection.ts         ← unchanged
│   └── explain.ts            ← updated (ANALYZE flag support)
└── utils/
    ├── planPrinter.ts        ← NEW (colour plan tree)
    ├── planAnalyzer.ts       ← NEW (static analysis rules)
    └── baseline.ts           ← NEW (snapshot I/O + diff)

.github/
└── workflows/
    └── querypilot.yml        ← NEW (full CI pipeline)

queries/
├── report.sql                ← existing
└── slow.sql                  ← NEW (bad query for demos)
```

### Usage
```bash
# Development (all commands)
npm run dev -- analyze   ./queries/report.sql
npm run dev -- optimize  ./queries/slow.sql
npm run dev -- benchmark ./queries/report.sql --runs 20
npm run dev -- baseline save ./queries/report.sql --ref main
npm run dev -- compare   ./queries/report.sql

# Or use the shorthand npm scripts:
npm run analyze   -- ./queries/report.sql
npm run optimize  -- ./queries/slow.sql
npm run benchmark -- ./queries/report.sql
npm run compare   -- ./queries/report.sql

# Type-check without running
npm run typecheck
```

### Completed
- [x] `qp report <file>` — Markdown summary for PR comments

### Next Steps
- [ ] Add `--threshold <pct>` flag on `compare` to customize regression sensitivity
- [ ] Write vitest unit tests for `planAnalyzer.ts`, `baseline.ts`, and `prismaParser.ts`
- [ ] Add `.env.example` file for onboarding
- [ ] Add LLM-powered query rewrite suggestions (Gemini/OpenAI API)

---

## Session 3 — Prisma Schema Parsing

### What Changed

#### `prisma <file>` — NEW command
- Parses `.prisma` schema files and extracts model definitions
- Prints model name, fields (with types, optional/list modifiers), and relations
- `--sql` flag: prints generated `CREATE TABLE` and `SELECT *` SQL for each model
- `--analyze <model>` flag: runs EXPLAIN on a generated `SELECT *` query for the model
- Detects `@id`, `@unique`, `@default(autoincrement())`, `@relation` attributes
- Detects `belongs-to`, `has-one`, `has-many` relation kinds

#### `src/db/prismaParser.ts` — NEW
Lightweight regex-based Prisma schema parser (no Prisma dependency required):
- `parsePrismaSchema(schema)` — parse schema string into structured `PrismaSchema`
- `readPrismaSchema(filePath)` — read and parse a `.prisma` file from disk
- `modelToSql(model)` — generate `CREATE TABLE` SQL from a model
- `modelToSelectSql(model)` — generate `SELECT * ... LIMIT 1` SQL from a model
- Handles model attributes (`@@id`, `@@unique`), field attributes (`@id`, `@unique`, `@relation`), relation detection

#### `src/index.ts` — updated
- Added `chalk` import
- Added `prisma <file>` command with `--sql` and `--analyze <model>` options
- Dynamic imports for `explainQuery`, `pool`, `printPlanNode` inside `--analyze` path

#### `queries/schema.prisma` — NEW
Sample Prisma schema with 3 models (User, Post, Comment) for testing.

### Updated Project Structure
```
src/
├── index.ts                  ← updated (prisma command added)
├── actions/
│   ├── analyze.ts            ← upgraded (pretty tree + findings)
│   ├── benchmark.ts          ← NEW (timing loop, percentiles)
│   ├── optimize.ts           ← NEW (action items with severity)
│   └── compare.ts            ← NEW (baseline diff, regression detection)
├── db/
│   ├── connection.ts         ← unchanged
│   ├── explain.ts            ← updated (ANALYZE flag support, no SELECT-only restriction)
│   └── prismaParser.ts       ← NEW (Prisma schema parser)
└── utils/
    ├── planPrinter.ts        ← NEW (colour plan tree)
    ├── planAnalyzer.ts       ← NEW (static analysis rules)
    └── baseline.ts           ← NEW (snapshot I/O + diff)

.github/
└── workflows/
    └── querypilot.yml        ← NEW (full CI pipeline)

queries/
├── report.sql                ← existing
├── slow.sql                  ← NEW (bad query for demos)
└── schema.prisma             ← NEW (sample Prisma schema)
```

### Usage
```bash
# Development (all commands)
npm run dev -- analyze   ./queries/report.sql
npm run dev -- optimize  ./queries/slow.sql
npm run dev -- benchmark ./queries/report.sql --runs 20
npm run dev -- baseline save ./queries/report.sql --ref main
npm run dev -- compare   ./queries/report.sql
npm run dev -- prisma    ./queries/schema.prisma
npm run dev -- prisma    ./queries/schema.prisma --sql
npm run dev -- prisma    ./queries/schema.prisma --analyze User

# Or use the shorthand npm scripts:
npm run analyze   -- ./queries/report.sql
npm run optimize  -- ./queries/slow.sql
npm run benchmark -- ./queries/report.sql
npm run compare   -- ./queries/report.sql

# Type-check without running
npm run typecheck
```