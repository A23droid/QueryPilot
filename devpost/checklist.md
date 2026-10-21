---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast

## Slices

- [x] **1. Deterministic plan analysis and visual tree output**
  Becomes usable: Running `qp analyze` outputs a formatted execution plan tree with node costs, row estimates, and scan type indicators.
  Why now: Proves the core PostgreSQL EXPLAIN parsing pipeline end to end before adding LLM or security layers.
  PRD ref: `prd.md > The Core Journey` (steps 1-4)
  Spec ref: `spec.md > 1. Plan Analyzer`, `spec.md > 2. Plan Visualizer`
  Build: Implement `src/db/explain.ts`, `src/utils/planAnalyzer.ts`, and `src/utils/planPrinter.ts`. Connect CLI in `src/index.ts`.
  Verify (mechanical): Run `npx vitest run tests/planAnalyzer.test.ts tests/planPrinter.test.ts`. All 18 tests pass.
  Learner check: Execute plan analysis on a simulated query and verify the indented colored tree renders accurately.
  Commit: `feat: implement core query analysis and visual plan printer`

- [x] **2. CI baseline snapshots and regression gating**
  Becomes usable: Running `qp compare` compares current query costs against `.baseline.json` and exits with code 1 if cost regresses > 20%.
  Why now: Delivers the core CI/CD regression protection guarantee that prevents unindexed queries from merging.
  PRD ref: `prd.md > 2. Baseline Comparison & CI Regression Gating`
  Spec ref: `spec.md > 3. Baseline & CI Comparator`
  Build: Implement `src/utils/baseline.ts`, `src/actions/compare.ts`, and `src/actions/report.ts`.
  Verify (mechanical): Run `npx vitest run tests/baseline.test.ts tests/compare.test.ts tests/report.test.ts`. All 13 tests pass.
  Learner check: Trigger a comparison against an existing snapshot and check the formatted regression summary table.
  Commit: `feat: add baseline snapshots, compare command, and PR reporter`

- [x] **3. AI query rewrites and Prisma schema extraction**
  Becomes usable: Running with `--suggest` asks an LLM (Groq / Gemini / OpenAI) to output concrete SQL rewrites and exact index DDL, incorporating `.prisma` schema models.
  Why now: Gives developers actionable fixes directly in their terminal instead of just reporting slow query problems.
  PRD ref: `prd.md > 3. AI-Powered Query Rewrites & Schema Context`
  Spec ref: `spec.md > 4. LLM Suggestion Engine`, `spec.md > 5. Prisma AST Parser`
  Build: Implement `src/llm/suggest.ts` and `src/db/prismaParser.ts`.
  Verify (mechanical): Run `npx vitest run tests/prismaParser.test.ts tests/llmSuggest.test.ts`. All 7 tests pass.
  Learner check: Run `qp analyze` with `--suggest` and verify generated SQL index DDL.
  Commit: `feat: add LLM query suggestions and Prisma AST parser`

- [x] **4. Model Context Protocol (MCP) server & ArmorIQ zero-trust token authorization**
  Becomes usable: Autonomous AI agents can safely inspect query plans over Streamable HTTP while schema mutations (`apply_index`) are blocked by policy.
  Why now: Completes the zero-trust governance layer so AI agents can diagnose production databases safely.
  PRD ref: `prd.md > 4. ArmorIQ Zero-Trust Governance & MCP Server`
  Spec ref: `spec.md > 6. ArmorIQ Security Guard & MCP Server`
  Build: Implement `src/security/armoriq.ts`, `src/mcp/server.ts`, and `src/agent.ts`. Configure `armoriq.yaml`.
  Verify (mechanical): Run test suite: 41 passing tests across all 8 suites (`npm test`).
  Learner check: Run the autonomous agent loop in `src/agent.ts` and verify `explain_query` is allowed while `apply_index` is blocked.
  Commit: `feat: add ArmorIQ authorization integration and MCP server`

## Hands-on Checkpoints

- [x] Early usable behavior explored — verified terminal visual tree rendering and deterministic cost calculations.
- [x] Final kick-the-tires exploration and feedback completed — verified baseline regression gating and ArmorIQ policy enforcement.

## Final Review

- [x] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [x] Learning activity complete — guided route and focused architecture tour completed across core modules.
- [x] Optional edit and transfer reflection addressed — verified reusable pattern of combining deterministic AST analysis with zero-trust AI agent policies.
- [x] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse.

Activity and evidence: Verified 41 passing tests in Vitest; checked agent loop in `src/agent.ts` and MCP server in `src/mcp/server.ts`.
Route and stops: `src/utils/planAnalyzer.ts` (AST walk) -> `src/actions/compare.ts` (CI baseline diff) -> `src/security/armoriq.ts` (CSRG token check) -> `src/mcp/server.ts` (MCP tools).
Edit outcome: Kept and verified; all 41 vitest tests pass.
Reflection: Connected deterministic static analysis to AI governance: deterministic checks catch objective errors fast, while LLMs provide contextual rewrites under strict policy tokens.
Activity mode: Live app, test runner, and interactive HTML map.

## Revisions

- Switched to AST-based standalone Prisma schema parsing — discovered that requiring `@prisma/client` runtime generation created heavy dependencies for lightweight CI environments.
- Added ArmorIQ token intent check to MCP server — verified that AI agents require cryptographic CSRG tokens rather than simple static API keys to prevent tool hijacking.
