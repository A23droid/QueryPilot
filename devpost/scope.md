---
doc: scope
status: approved
---

# QueryPilot

Catch database performance regressions and govern autonomous database agents before they reach production.

## The Unique Kernel
Deterministic execution plan analysis paired with zero-trust cryptographic policy enforcement (ArmorIQ) over the Model Context Protocol (MCP). It allows autonomous AI agents to diagnose production SQL queries safely via read-only plan inspection while cryptographically blocking unapproved schema mutations or destructive writes.

## Who It's For
Backend engineers, DevOps/platform teams, and developers using ORMs (Prisma, Drizzle) and AI coding assistants.
- **What they're trying to do:** Catch slow unindexed queries in CI before they crash production, and safely grant AI agents database troubleshooting capabilities.
- **What they do today:** Manually run `EXPLAIN ANALYZE` after incidents occur, or blindly hand database credentials to AI agents with zero runtime governance.

## The Core Loop
1. Developer or CI runs QueryPilot against a SQL query or `.prisma` schema file.
2. QueryPilot parses the PostgreSQL execution plan, displays a colored visual plan tree, and flags anti-patterns (sequential scans, high-cost sorts, missing indexes).
3. If `--suggest` is requested, an LLM synthesizes concrete SQL rewrites and exact index DDL.
4. If an autonomous agent requests actions, QueryPilot issues cryptographic CSRG tokens via ArmorIQ: read-only plan inspections are approved, while schema modifications are strictly blocked.
5. In CI pipelines, QueryPilot compares plan costs against a baseline snapshot (`.baseline.json`) and fails pull request checks if costs regress beyond thresholds.

## Inspiration & Identity
- **Inspirations:** PostgreSQL `EXPLAIN ANALYZE`, GitHub Actions CI checks, Model Context Protocol (MCP), and zero-trust security control planes.
- **Look & Feel:** High-contrast terminal output with ANSI colors (cyan headers, yellow warnings, red critical alerts), clean Markdown PR reports, and concise structured diagnostics.
- **Mood:** Fast, dependable, zero-friction developer tooling that acts as a seatbelt for database reliability.

## Why This Matters to the Learner
AI tools write code faster than ever, but they frequently introduce catastrophic N+1 queries, unindexed table scans, and dangerous agent hallucinations. Building a system that deterministically validates query cost and cryptographically gates AI actions bridges the gap between AI speed and production database safety.

## What "Working" Looks Like
A developer runs a CLI command on an unindexed query:
```bash
qp analyze "SELECT * FROM users WHERE LOWER(email) = 'test@example.com';"
```
QueryPilot immediately renders an indented visual execution plan tree, identifies the `Seq Scan` anti-pattern with a `CRITICAL` alert, provides an AI-suggested B-tree functional index rewrite, and enforces ArmorIQ zero-trust checks when invoked by an autonomous agent.

## The POC Boundary
- **Included:**
  - Deterministic PostgreSQL `EXPLAIN (FORMAT JSON)` plan tree parser and color visualizer.
  - Anti-pattern static analyzer (sequential scans on large tables, unindexed sorts, Cartesian joins).
  - Baseline regression comparison engine (`.baseline.json` cost differential gating).
  - LLM-powered query rewrite recommendations (Groq / OpenAI / Gemini).
  - Prisma schema AST parser to extract models and generate query simulations without running Prisma client.
  - Model Context Protocol (MCP) server over Streamable HTTP (`:3333`).
  - ArmorIQ cryptographic intent token evaluation (`armoriq.yaml`) blocking unauthorized schema mutations.
  - Automated PR Markdown comment generator with Chalk terminal visualizer.
  - Live ORM runtime query interceptor (`qp watch`) streaming real-time EXPLAIN analysis and regression alerts for Prisma/Drizzle.
  - Software Carbon Intensity (SCI) footprint calculator (kWh and CO2e per 10k executions).

## Later
- Kernel-level PostgreSQL wire-protocol proxy for non-ORM raw database traffic.
- Automated PR bot integrating GitHub Apps for direct commit suggestions.
- Support for MySQL and SQLite execution plan schemas.

## Explicitly Cut
- **Direct production database write execution:** QueryPilot never executes schema mutations directly in this PoC; it only generates recommendations and blocks unauthorized mutations.
- **Full web dashboard:** Prioritized terminal CLI and CI Markdown reports to keep the PoC laser-focused within hackathon scope.
