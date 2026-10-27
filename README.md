# QueryPilot

> **Catch database performance regressions and govern autonomous database agents before they reach production.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-1.0-orange.svg)](https://modelcontextprotocol.io/)
[![Google Cloud](https://img.shields.io/badge/Google%20Cloud-Cloud%20Run-4285F4.svg?logo=googlecloud&logoColor=white)](https://cloud.google.com/run)
[![ArmorIQ](https://img.shields.io/badge/Security-ArmorIQ-purple.svg)](https://armoriq.ai/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Overview

Modern software development relies heavily on AI coding assistants and Object-Relational Mappers (ORMs like Prisma and Drizzle). While these tools write syntactically correct code rapidly, they frequently introduce two critical failure modes:

1. **Silent Performance Regressions**: Full sequential table scans, unindexed sorts, and quadratic join explosions that pass unit tests but crash production databases under real load.
2. **Autonomous Agent Security Risks**: When AI agents are given database credentials to optimize or debug queries, direct access creates unacceptable risk — agents can hallucinate destructive write queries (`DROP TABLE`, unapproved index locks) or leak sensitive records.

**QueryPilot** solves both problems. It provides automated query plan analysis, CI regression prevention, and a **Model Context Protocol (MCP)** server deployed on **Google Cloud Platform (GCP Cloud Run)** governed by **ArmorIQ** zero-trust policy enforcement.

---

## System Architecture

```
                                      ┌────────────────────────────────────────┐
                                      │         ArmorIQ Control Plane          │
                                      │   • Validates Agent Identity           │
                                      │   • Mints CSRG Cryptographic Tokens    │
                                      │   • Evaluates Whitelist Policy         │
                                      └──────────────────┬─────────────────────┘
                                                         │
┌─────────────────────────────┐   1. Request Tool Call   ▼
│      QueryPilot Agent       │ ───────────────────> [ Intent Token Issued ]
│  (Autonomous Query Analysis │                              │
│   & Optimization Engine)    │ <────────────────────────────┘
└──────────────┬──────────────┘   2. Invoke Protected Tool
               │
               │  Tool: "explain_query"  ──>  ✅ ALLOWED (Read-Only Plan Inspection)
               │  Tool: "apply_index"    ──>  ⛔ BLOCKED (Unauthorized Schema Mutation)
               ▼
┌────────────────────────────────────────┐
│     QueryPilot MCP Server (GCP)        │
│   (Google Cloud Run HTTP - :8080)      │
└──────────────────┬─────────────────────┘
                   │
                   │ (EXPLAIN FORMAT JSON)
                   ▼
┌────────────────────────────────────────┐
│       PostgreSQL Database (Neon)       │
└────────────────────────────────────────┘
```

---

## Core Capabilities

- **Protected Autonomous Agent Loop**: An AI agent that inspects query execution plans, diagnoses bottlenecks via LLMs (Groq / Llama), and is strictly restricted by ArmorIQ from executing unapproved write operations.
- **Model Context Protocol (MCP) Server**: Exposes database operations through the standard MCP interface over Streamable HTTP, eliminating the need to distribute root database credentials.
- **Cloud-Native Deployment (Google Cloud Platform)**: Production-ready multi-stage Docker build deployed to **Google Cloud Run** with automated scaling, secret isolation via **GCP Secret Manager**, and GitLab CI/CD staging/production pipelines.
- **Visual Plan Tree**: Recursively renders PostgreSQL `EXPLAIN (FORMAT JSON)` execution plans with cost highlights, row estimates, and filter conditions.
- **Deterministic Static Analyzer**: Automatically flags anti-patterns (Sequential Scans on large tables, in-memory sorts, missing indexes) with categorized severity ratings (`CRITICAL`, `WARNING`, `INFO`).
- **AI-Powered Query Rewrites**: Generates concrete SQL rewrites, index recommendations, and plain-English performance explanations.
- **Live ORM Query Interception (`qp watch`)**: Runtime middleware for Prisma (and any ORM) that intercepts every query your app makes, runs EXPLAIN in the background, and streams regression alerts and SCI carbon metrics to a live terminal dashboard — zero latency added to your app.
- **Prisma Schema Parser**: Reads `.prisma` schema files and generates matching SQL DDL and query simulations without requiring Prisma client generation.
- **Baseline Regression Detection**: Captures plan snapshots (`.baseline.json`) and fails CI pull request checks if query execution costs regress beyond established thresholds.
- **Software Carbon Intensity (SCI)**: Calculates per-query CO₂e emissions aligned with the Green Software Foundation SCI specification — embedded in every `qp compare`, `qp report`, and `qp watch` output.

---

## Quick Start

### 1. Installation

```bash
git clone https://github.com/your-org/querypilot.git
cd querypilot
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env` and provide your credentials:

```bash
cp .env.example .env
```

Key variables:
- `DATABASE_URL`: PostgreSQL connection string (Neon, Supabase, or local Postgres).
- `ARMORIQ_API_KEY`: ArmorIQ API key.
- `ARMORIQ_USER_EMAIL`: ArmorIQ account email.
- `GROQ_API_KEY`: Groq API key for Llama 3.1 query rewrites.
- `QUERY_PILOT_MCP_TOKEN`: Secret Bearer token for the MCP server.

### 3. Run the ArmorIQ Protected Agent

Run the autonomous agent on a representative query:

```bash
npm run agent queries/nextjs-api-route.sql
```

The agent will:
1. Request authorization for `explain_query` via ArmorIQ (**ALLOWED ✅**).
2. Fetch the live PostgreSQL execution plan and analyze bottlenecks.
3. Attempt to automatically execute `apply_index` (**BLOCKED ⛔** by ArmorIQ policy).

---

## CLI Reference

| Command | Purpose |
| :--- | :--- |
| `npm run agent <file>` | Runs the ArmorIQ-governed autonomous AI agent loop on a SQL query |
| `npm run mcp` | Starts the QueryPilot MCP dev server via tsx on port 3333/8080 |
| `npm start` | Starts the production compiled MCP server (`dist/mcp/server.js`) |
| `npm run analyze <file>` | Runs `EXPLAIN` and prints color-coded plan tree with findings |
| `npm run analyze <file> -- --armoriq` | Runs query analysis through ArmorIQ authorization |
| `npm run optimize <file> -- --suggest` | Analyzes plan and outputs LLM query rewrite recommendations |
| `npm run benchmark <file> -- -r 10` | Measures query latency percentiles (p50, p95, p99) over N runs |
| `npm run prisma <file> -- --sql` | Parses a Prisma schema and generates corresponding SQL DDL |
| `npm run compare <file> -- -t 20` | Diffs current plan cost vs baseline snapshot; exits 1 on regression |
| `npm run report <file>` | Generates rich Markdown PR comment with plan, findings, and SCI carbon |
| `npm run watch` | Starts live ORM interceptor — attach Prisma middleware for real-time analysis |
| `npm test` | Runs the test suite with Vitest (72 tests) |

---

## Google Cloud Platform (GCP) Deployment

QueryPilot leverages **Google Cloud Platform (GCP)** for secure, serverless cloud execution of its Model Context Protocol (MCP) server:

- **Google Cloud Run**: The MCP server is packaged in a lightweight multi-stage [Dockerfile](Dockerfile) and deployed as a serverless container on Cloud Run with automated TLS termination, auto-scaling to zero, and native HTTP stream processing.
- **GCP Secret Manager**: Critical secrets (`DATABASE_URL`, `ARMORIQ_API_KEY`, `QUERY_PILOT_MCP_TOKEN`) are securely injected at runtime from Secret Manager, preventing credential leakage in container images or source repositories.
- **Artifact Registry & Cloud Build**: Automated container builds and versioned artifact storage integrated into continuous deployment pipelines.
- **Automated CI/CD**: Staging deployments automatically trigger on push to `main`, with supervised manual promotion gates protecting production Cloud Run instances.

```bash
# Direct deployment to Google Cloud Run
gcloud run deploy querypilot-mcp \
  --source . \
  --region asia-south1 \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,ARMORIQ_API_KEY=ARMORIQ_API_KEY:latest,QUERY_PILOT_MCP_TOKEN=QUERY_PILOT_MCP_TOKEN:latest"
```

For complete step-by-step instructions, see the [SETUP.md](SETUP.md) deployment guide.

---

## Security Architecture

QueryPilot's security model enforces the principle of least privilege using [armoriq.yaml](armoriq.yaml):

```yaml
version: v1
identity:
  api_key: $ARMORIQ_API_KEY
  user_id: querypilot-user
  agent_id: querypilot
environment: sandbox
proxy:
  url: https://customer-proxy.armoriq.ai
mcp_servers:
  - id: querypilot-db
    url: https://your-tunnel.trycloudflare.com/mcp
    auth:
      type: bearer
      token: $QUERY_PILOT_MCP_TOKEN
policy:
  allow:
    - querypilot-db.explain_query
  deny: []
intent:
  ttl_seconds: 300
  require_csrg: true
```

- **Whitelist Enforcement**: Only actions explicitly defined under `policy.allow` can be executed.
- **CSRG Merkle Proofs**: Every request requires Cryptographic State Root Generation (CSRG) token proofs matching the declared plan.
- **Zero-Trust Boundary**: Even if an LLM hallucinates destructive DDL commands, ArmorIQ intercepts and rejects the call before it reaches PostgreSQL.

---

## Project Structure

```
querypilot/
├── src/
│   ├── actions/          # CLI command handlers (analyze, optimize, benchmark, compare, report, watch)
│   ├── db/               # PostgreSQL connection pool, explain wrappers, Prisma parser
│   ├── llm/              # Groq / Llama query rewrite suggestions
│   ├── mcp/              # MCP server implementation (Streamable HTTP transport)
│   ├── middleware/       # Prisma/ORM runtime query interceptor (attachQueryPilot)
│   ├── security/         # ArmorIQ SDK client and policy enforcement bridge
│   ├── utils/            # Plan visualizer, analyzer, Chalk terminal renderer, SCI carbon
│   ├── watch/            # qp watch server, live dashboard display, shared types
│   ├── agent.ts          # Autonomous AI agent loop
│   └── index.ts          # CLI entry point (Commander.js)
├── examples/             # Integration examples and demo scripts
│   ├── watch-demo.ts         # Self-contained qp watch simulator (20 query scenarios)
│   ├── prisma-app-example.ts # Real-world Next.js/Express Prisma wiring guide
│   └── python-sqlalchemy-example.py # Python SQLAlchemy integration
├── queries/              # Sample queries, Next.js API routes, and Prisma schemas
├── tests/                # Unit test suite (Vitest — 46 tests)
├── armoriq.yaml          # ArmorIQ configuration and tool policy definitions
├── SETUP.md              # Step-by-step installation and execution guide
└── OBJECTIVE.md          # Project problem statement and design scope
```

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
