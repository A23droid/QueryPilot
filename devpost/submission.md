# GitLab Transcend Hackathon: Life After Code — Submission Guide

**Project Name:** QueryPilot — Zero-Trust Database Agent Governance & CI Regression Guard  
**Track:** Path B — Bring Your Own (Existing Open Source Project)  
**Autonomy Level:** Supervised  
**Public GitLab Repository:** https://gitlab.com/idk-group9212743/QueryPilot  
**Original Open-Source Project:** https://github.com/quwrof00/QueryPilot  
**License:** MIT License (visible in GitLab repository root)  

---

## 1. Project Overview & Elevator Pitch

> **Code generation is solved. What happens next to your database is the challenge.**

QueryPilot is an autonomous DevSecOps platform that catches silent database performance regressions and strictly governs autonomous AI agents across the post-code lifecycle. By integrating the **GitLab Duo Agent Platform**, **Model Context Protocol (MCP)**, and **ArmorIQ Zero-Trust cryptographic policy enforcement**, QueryPilot ensures that AI coding assistants and ORMs cannot introduce unindexed table scans or execute unapproved database schema mutations.

---

## 2. The Problem It Solves

Modern developers and automated coding agents (Cursor, Devin, Copilot) write syntactically clean ORM code rapidly. However, two critical failure modes occur after the code is generated:

1. **Silent Performance Regressions:** Full sequential table scans, missing composite indexes, and quadratic join explosions pass unit tests but crash production databases under real load.
2. **Autonomous Agent Hazards:** When AI agents are granted database access to diagnose or optimize slow queries, giving them direct credentials creates severe risk—agents can hallucinate destructive DDL (`DROP TABLE`, unapproved schema locks) or leak sensitive data.

QueryPilot solves both problems natively in GitLab by turning query inspection, regression prevention, and database agent governance into an automated post-code workflow.

---

## 3. How QueryPilot Uses the GitLab Duo Agent Platform

QueryPilot actively leverages GitLab Duo Agent Platform features:

- **GitLab Duo Agent (`.gitlab/agents/querypilot-agent/config.yaml`):** An autonomous database agent configured with MCP server tool integration (`querypilot-db`). It handles query plan inspection, detects anti-patterns, and is strictly restricted by zero-trust policies from modifying database state.
- **GitLab Duo Flow (`.gitlab/flows/mr-query-analysis.yaml`):** An event-driven workflow that automatically triggers on Merge Requests. It analyzes changed SQL/Prisma files, generates query execution plans, checks for baseline cost regressions, and comments directly on the MR with actionable diagnostic findings.
- **MCP Server (`src/mcp/server.ts`):** Implements the official Model Context Protocol (v1) over Streamable HTTP transport, exposing isolated, read-only `explain_query` capabilities to GitLab Duo agents without distributing raw database credentials.

---

## 4. Autonomy Level: Supervised

QueryPilot operates at the **Supervised** autonomy level:
- **Autonomous Multi-Step Execution:** When a developer pushes code or opens a Merge Request, the QueryPilot AI Agent independently analyzes query execution plans, queries LLM diagnostic models, compares execution costs against saved baselines, and executes security verification without human micromanagement.
- **Supervised Quality Gates:** Critical violations (cost regressions exceeding 20% or unauthorized write attempts) automatically halt pipeline progression. Production deployments to Google Cloud Run are gated by manual human review and approval (`when: manual`).

---

## 5. DevSecOps Lifecycle Stages Covered (7 of 9 Stages)

QueryPilot automates across 7 core stages of GitLab's DevSecOps lifecycle:

| Lifecycle Stage | How QueryPilot Automates It |
|---|---|
| **1. Create** | TypeScript build, dependency caching, and automated Prisma schema translation to SQL DDL. |
| **2. Verify** | Runs comprehensive 41-test suite with JUnit reporting; executes `qp compare` on Merge Requests to detect query execution cost regressions against `.baseline.json` snapshots. |
| **3. Secure** | ArmorIQ zero-trust security scan on all queries; MCP server authentication audit ensuring constant-time Bearer token verification. |
| **4. Govern** | Generates detailed Markdown Policy Enforcement and Compliance Audit artifacts (`governance-reports/`) tracking allowed vs blocked agent actions. |
| **5. Package** | Builds multi-stage production Docker container and pushes to GitLab Container Registry (`$CI_REGISTRY_IMAGE`). |
| **6. Release** | Deploys QueryPilot MCP server to Google Cloud Run (automatic staging deploy, supervised manual production promotion). |
| **7. Monitor** | Automated post-deploy smoke test verifying live MCP endpoint health and security boundaries. |

---

## 6. Path B Requirement: Work Completed On or After October 5th

QueryPilot originated from an open-source query analysis utility. **All post-code agentic automation, GitLab integration, and deployment layers were built entirely after October 5th for this hackathon:**

- ✅ Built the **GitLab Duo Agent** configuration (`.gitlab/agents/querypilot-agent/config.yaml`) with MCP server integration.
- ✅ Designed the **GitLab Duo MR Analysis Flow** (`.gitlab/flows/mr-query-analysis.yaml`) for automated MR query plan inspection.
- ✅ Created the **7-stage GitLab CI/CD Pipeline** (`.gitlab-ci.yml`) featuring automated regression guards, ArmorIQ security audits, and compliance reporting.
- ✅ Implemented the **Model Context Protocol (MCP) Streamable HTTP Server** (`src/mcp/server.ts`) with zero-trust token authentication.
- ✅ Built **ArmorIQ Zero-Trust Integration** with CSRG cryptographic intent proof validation to block hallucinated schema mutations.
- ✅ Created the multi-stage **Dockerfile** and Google Cloud Run deployment automation.

---

## 7. Demo Video Outline (< 3 Minutes)

- **0:00 – 0:30 | Introduction & Problem:** Explain why post-code database governance is critical for AI-generated code.
- **0:30 – 1:15 | Merge Request & CI Automation:** Show an opened MR triggering the GitLab CI pipeline and QueryPilot baseline regression guard.
- **1:15 – 2:00 | ArmorIQ Zero-Trust Security in Action:** Show the agent executing `explain_query` (ALLOWED ✅) vs attempting `apply_index` / `DROP TABLE` (BLOCKED ⛔ by ArmorIQ policy). Show the governance report artifact.
- **2:00 – 2:30 | 7 Lifecycle Stages:** Walk through the green GitLab pipeline (`create` ➔ `verify` ➔ `secure` ➔ `govern` ➔ `package` ➔ `release` ➔ `monitor`).
- **2:30 – 3:00 | Conclusion & Impact:** Summary of how QueryPilot bridges AI coding assistants with enterprise database safety.
