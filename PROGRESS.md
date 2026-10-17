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
- [x] `qp optimize --suggest` — LLM-powered query rewrite suggestions (Groq Llama `llama-3.1-70b-versatile`, Gemini, or OpenAI; gated on API key)
- [x] Add `--threshold <pct>` flag on `compare` to customize regression sensitivity
- [x] Write vitest unit tests for `planAnalyzer.ts`, `baseline.ts`, and `prismaParser.ts`
- [x] Add `.env.example` file for onboarding with DB and LLM configurations

### Next Steps
- [ ] Add pre-commit hooks or CI action for running test suite
- [ ] Add support for multi-statement migrations or DDL analysis

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

# Run test suite
npm test
```

---

## Session 4 — Threshold Option, Unit Tests & Onboarding

### What Changed

#### `compare <file>` — `--threshold <pct>` flag
- Added `-t, --threshold <number>` option (default: `20`) to `compare` command in [src/index.ts](file:///d:/Projects/QueryPilot/src/index.ts) and [src/actions/compare.ts](file:///d:/Projects/QueryPilot/src/actions/compare.ts)
- Allows configuring custom sensitivity for regression failure threshold in CI or local usage
- Updated banner and error output to reflect active threshold value

#### Unit Test Suite — Vitest
- Added [src/tests/planAnalyzer.test.ts](file:///d:/Projects/QueryPilot/src/tests/planAnalyzer.test.ts): unit tests covering all 6 static analysis rules (Seq Scan large/small, high cost, Sort, Nested Loop + Seq Scan child, Hash build size) and severity sorting.
- Added [src/tests/baseline.test.ts](file:///d:/Projects/QueryPilot/src/tests/baseline.test.ts): tests covering path derivation, cost diff calculations (regression, improvement, zero cost safety), and snapshot filesystem I/O.
- Added [src/tests/prismaParser.test.ts](file:///d:/Projects/QueryPilot/src/tests/prismaParser.test.ts): tests covering datasource/generator extraction, model and field parsing, type and attribute mapping, relations (`belongs-to`, `has-many`), and SQL/SELECT generation.

#### Onboarding Configuration — `.env.example`
- Expanded [.env.example](file:///d:/Projects/QueryPilot/.env.example) to include both Postgres connection details with Docker one-liner instructions and optional LLM keys (`GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`) for `qp optimize --suggest`.

#### Documentation
- Updated [docs/commands.md](file:///d:/Projects/QueryPilot/docs/commands.md) with `--threshold` flag details and updated project tree.

---

## Session 5 — Packaging, Distribution & Ship Readiness

### What Changed

#### `package.json` Distribution Setup
- Configured `"main": "dist/index.js"` and `"types": "dist/index.d.ts"`
- Added `"files": ["dist", "README.md", "LICENSE"]` to ensure clean publishing to npm
- Added `"prepack": "npm run build"` hook so TypeScript build is guaranteed to run before packaging
- Added `"report"` and `"prisma"` npm shortcut scripts
- Added package description, keywords, and MIT license

#### Repository & Licensing
- Created root [README.md](file:///d:/Projects/QueryPilot/README.md) with badges, architecture overview, installation instructions, command table, and CI workflow template.
- Added [LICENSE](file:///d:/Projects/QueryPilot/LICENSE) (MIT).

#### CI Pipeline & Reporting
- Added Type-check and Vitest unit testing steps to [.github/workflows/querypilot.yml](file:///d:/Projects/QueryPilot/.github/workflows/querypilot.yml)
- Added `-t, --threshold <number>` flag support to `qp report <file>` in [src/actions/report.ts](file:///d:/Projects/QueryPilot/src/actions/report.ts) and [src/index.ts](file:///d:/Projects/QueryPilot/src/index.ts)

---

## Session 6 — Dedicated `tests/` Folder & Full Feature Test Suite

### What Changed

#### Dedicated `tests/` Directory
Created top-level [tests/](file:///d:/Projects/QueryPilot/tests) containing test suites across every feature of QueryPilot:
1. [tests/planPrinter.test.ts](file:///d:/Projects/QueryPilot/tests/planPrinter.test.ts) — Tree formatting, cost/rows, actual runtime, conditions, filters, recursion
2. [tests/planAnalyzer.test.ts](file:///d:/Projects/QueryPilot/tests/planAnalyzer.test.ts) — All 6 static analysis rules, detection thresholds, severity sorting
3. [tests/baseline.test.ts](file:///d:/Projects/QueryPilot/tests/baseline.test.ts) — Path resolution, diff calculation, snapshot persistence
4. [tests/compare.test.ts](file:///d:/Projects/QueryPilot/tests/compare.test.ts) — Custom thresholds (`--threshold`), regression/improvement/neutral detection
5. [tests/report.test.ts](file:///d:/Projects/QueryPilot/tests/report.test.ts) — Markdown report generation, table formatting, severity badges, diff table
6. [tests/prismaParser.test.ts](file:///d:/Projects/QueryPilot/tests/prismaParser.test.ts) — Schema AST parsing, field attributes, relation detection, SQL generation
7. [tests/llmSuggest.test.ts](file:///d:/Projects/QueryPilot/tests/llmSuggest.test.ts) — AI rewrite fallback messaging and configuration handling
8. [tests/benchmark.test.ts](file:///d:/Projects/QueryPilot/tests/benchmark.test.ts) — Query validation, timing collection, percentile distribution math ($p50$, $p95$, $p99$, min, max, mean)

#### Test Configuration
- Created [vitest.config.ts](file:///d:/Projects/QueryPilot/vitest.config.ts) configured to discover all tests in `tests/**/*.test.ts`.
- Excluded test folders from [tsconfig.json](file:///d:/Projects/QueryPilot/tsconfig.json) so `npm run build` only emits production artifacts into `dist/`.

