# QueryPilot — Objective & Project Scope

Catch database performance regressions and govern autonomous database agents before they reach production.

---

## The Problem

Modern software development increasingly relies on AI-generated code and Object-Relational Mappers (ORMs like Prisma and Drizzle). While these tools dramatically accelerate application development, they introduce two critical risks:

1. **Silent Performance Regressions:**
   - Unindexed table scans on growing tables.
   - Accidental in-memory sorts and quadratic join explosions.
   - Function-wrapped columns (`LOWER(email)`) that bypass indexes.
   - Lack of automated query performance testing in CI/CD pipelines.

2. **Autonomous Agent Security Hazards:**
   - Autonomous AI coding agents (such as Devin, Cursor, and automated maintenance bots) are frequently granted database access to debug or optimize queries.
   - Giving an agent direct root credentials (`DATABASE_URL`) creates severe risk: agents can hallucinate destructive write queries (`DROP TABLE`, `ALTER TABLE`, unapproved index locks) or leak sensitive data.

---

## The Solution

**QueryPilot** combines automated PostgreSQL performance testing with **ArmorIQ** zero-trust policy governance and the **Model Context Protocol (MCP)**.

### Core Capabilities

1. **Protected Autonomous AI Agent Loop (`npm run agent <file>`):**
   - Autonomous AI agent analyzes application queries.
   - Governed through **ArmorIQ** cryptographic intent tokens (CSRG Merkle proofs).
   - Allows safe, read-only performance inspection (`explain_query`).
   - Automatically blocks unapproved database schema alterations (`apply_index`).

2. **Model Context Protocol (MCP) Database Server (`npm run mcp`):**
   - Standardized MCP server exposing isolated database operations over Streamable HTTP transport.
   - Eliminates the need to distribute raw database credentials to agents.

3. **Plan Tree Visualizer & Static Analyzer (`qp analyze <file>`):**
   - Parses PostgreSQL `EXPLAIN (FORMAT JSON)` into an intelligible, color-coded plan tree.
   - Detects anti-patterns with categorized severity badges (`CRITICAL`, `WARNING`, `INFO`).

4. **AI-Powered Query Rewrites (`qp optimize <file> --suggest`):**
   - Leverages high-speed LLMs (Groq / Llama 3.1 70B, Google Gemini) to diagnose plan bottlenecks and propose concrete SQL rewrites and exact index definitions.

5. **Prisma Schema Parser (`qp prisma <file> --sql`):**
   - Extracts models, relations, and fields directly from `.prisma` schemas and generates matching DDL and `SELECT` query simulations without requiring build steps.

6. **Baseline Regression CI Testing (`qp baseline save` / `qp compare`):**
   - Captures plan snapshots and fails CI pull request checks if query execution costs regress beyond established thresholds.