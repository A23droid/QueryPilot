# QueryPilot - Development Setup Guide

## Prerequisites

- Node.js 18+ (tested on v24)
- PostgreSQL 14+ (local or cloud like Neon/Supabase)
- (Optional) API key for LLM suggestions - Groq (recommended), Gemini, or OpenAI
- (Optional) ArmorIQ API key + user email for policy-gated agent mode

## Setup Steps

### 1. Clone & Install
```bash
git clone https://github.com/quwrof00/QueryPilot.git
cd QueryPilot
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env  # or create manually
```

Edit `.env` with your values:
- `DATABASE_URL` - PostgreSQL connection string (required for DB commands)
- `GROQ_API_KEY` - For LLM-powered `--suggest` (optional)
- `ARMORIQ_API_KEY` / `ARMORIQ_USER_EMAIL` - For ArmorIQ-gated execution (optional)

### 3. Build
```bash
npm run build        # Compile TypeScript to dist/
npm run typecheck    # Verify types
```

### 4. Link Globally (Optional)
```bash
npm link            # Enables `qp` command globally
```

### 5. Verify Installation
```bash
qp --version
qp analyze queries/report.sql
```

## Development Workflow

### Common Commands
```bash
npm run dev -- analyze queries/report.sql      # Run via tsx (no build)
npm run build                                 # Build to dist/
npm run typecheck                             # Type check only
npm test                                      # Run tests
```

### Testing ArmorIQ Integration
```bash
qp analyze queries/report.sql --armoriq       # Attempts ArmorIQ-gated execution
# Note: Requires registered MCP server named "querypilot-db" on ArmorIQ
```

### Testing LLM Suggestions
```bash
qp optimize queries/report.sql --suggest      # Uses Groq/Gemini/OpenAI if key present
```

## Project Conventions

- **TypeScript**: Strict mode, ES modules (`"type": "module"`), target ES2022
- **Comments**: Minimal, meaningful comments in core logic; avoid verbose docstrings in trivial code
- **Error Handling**: Graceful fallbacks (LLM/ArmorIQ failures don't break core functionality)
- **Security**: Read-only operations by design; write ops require explicit ArmorIQ policy
- **CLI**: Commander.js for parsing; chalk for colors; ora for spinners

## Debugging Tips

- If `qp` isn't found after `npm link`, check `npm config get prefix` is in PATH
- DB connection issues: verify `DATABASE_URL` and network access (especially for cloud DBs)
- ArmorIQ 404s: MCP server `querypilot-db` must be registered on your ArmorIQ account
- Groq model deprecation: check current available models if suggestions fail
