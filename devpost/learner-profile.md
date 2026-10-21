---
doc: learner-profile
---

# Learner Profile

## Initial Idea
An automated tool that catches database performance regressions before they hit production and protects databases from rogue AI agents, by analyzing PostgreSQL EXPLAIN execution plans and enforcing zero-trust policies through MCP (Model Context Protocol).

## Demonstrated Technical and Agent Experience
TypeScript/Node.js, PostgreSQL, SQL query optimization, and AI coding agents. Experienced with building CLI tools, working with AST parsing, and integrating LLMs (Groq, OpenAI, Gemini).
Evidence: "I want to prevent silent database regressions and govern autonomous AI agents interacting with databases."

## Planning-Workflow Experience
Familiar with spec-driven development and plan-first workflows. Values having clear technical boundaries, architecture contracts, and automated verification before diving into implementation.

## Desired Learning Outcome
Mastering plan-first agent workflows while integrating the Model Context Protocol (MCP) with zero-trust security control planes (ArmorIQ) for autonomous agents.

## Learning Moments
Integrated deterministic PostgreSQL plan analysis with cryptographic CSRG token verification in `src/security/armoriq.ts` and `src/agent.ts`. Verified that AI agents can diagnose bottlenecks autonomously while destructive mutations like `apply_index` remain strictly blocked.

## Interests, Inspirations, and Goals
Inspired by database observability platforms like pg_stat_statements and modern security architectures for AI agents. Goal is to give developers and CI pipelines a reliable shield against unindexed table scans and unsafe AI database actions.

## Vocabulary and Concepts Likely to Need Explanation
- Well understood: PostgreSQL EXPLAIN (JSON format), B-tree indexes, sequential scans, nested loop joins, CLI UX.
- Explored in depth: Model Context Protocol (MCP Streamable HTTP transport), ArmorIQ CSRG intent tokens, deterministic cost baselining.

## Collaboration and Communication Preferences
Concise explanations, focused decisions, and structured verification milestones.

## Areas Where the Learner Wants Ownership
Core architectural boundaries, security policies in `armoriq.yaml`, and database execution safety constraints.

## Likely Support Needs
Structuring the submission artifacts (`scope.md`, `prd.md`, `spec.md`, `checklist.md`) and framing the proof-of-concept journey for Devpost reviewers.

## Review Format
markdown
