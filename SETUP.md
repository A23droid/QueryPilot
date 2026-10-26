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
- `PORT` - HTTP listening port (defaults to 8080 in production)
- `QUERY_PILOT_MCP_TOKEN` - Secret Bearer token required for MCP authentication
- `DATABASE_URL` - PostgreSQL connection string (Neon or managed cloud Postgres for production)
- `GROQ_API_KEY` - For LLM-powered `--suggest` (optional)
- `ARMORIQ_API_KEY` / `ARMORIQ_USER_EMAIL` - For ArmorIQ-gated execution (optional)

### 3. Build & Run
```bash
npm run build        # Compile TypeScript to dist/
npm run typecheck    # Verify types
npm test             # Run complete test suite
npm start            # Run compiled MCP Server in production (node dist/mcp/server.js)
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

## Production Deployment (Google Cloud Run)

QueryPilot includes a production multi-stage `Dockerfile` and Cloud Run configuration targeting `asia-south1` (Mumbai).

### 1. Prerequisites on Google Cloud
- Google Cloud Project with Billing enabled.
- Cloud Run API, Cloud Build API, and Secret Manager API enabled:
  ```bash
  gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com
  ```
- Accessible PostgreSQL Database (Cloud Run runs in GCP and cannot access `localhost`; use Neon, Cloud SQL, or external managed Postgres).

### 2. Store Secrets in GCP Secret Manager
```bash
echo -n "your-secret-mcp-token" | gcloud secrets create querypilot-mcp-token --data-file=-
echo -n "postgresql://..." | gcloud secrets create querypilot-database-url --data-file=-
```

### 3. Create Least-Privilege Service Account
```bash
gcloud iam service-accounts create querypilot-runner \
  --description="Service account for QueryPilot Cloud Run instance"

# Grant Secret Accessor only
gcloud secrets add-iam-policy-binding querypilot-mcp-token \
  --member="serviceAccount:querypilot-runner@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding querypilot-database-url \
  --member="serviceAccount:querypilot-runner@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 4. Deploy to Cloud Run (Region: asia-south1)
```bash
gcloud run deploy querypilot-mcp \
  --source . \
  --region asia-south1 \
  --service-account querypilot-runner@PROJECT_ID.iam.gserviceaccount.com \
  --set-secrets="QUERY_PILOT_MCP_TOKEN=querypilot-mcp-token:latest,DATABASE_URL=querypilot-database-url:latest" \
  --allow-unauthenticated \
  --port 8080
```

### 5. Endpoint & MCP Client Configuration
Once deployed, Cloud Run will output your Service URL:
`https://querypilot-mcp-xyz-el.a.run.app`

The MCP endpoint is located at `/mcp`:
`https://querypilot-mcp-xyz-el.a.run.app/mcp`

Configure your MCP Client (e.g. Claude Desktop, Cursor, ArmorIQ, or custom client):
```json
{
  "mcpServers": {
    "querypilot-db": {
      "url": "https://querypilot-mcp-xyz-el.a.run.app/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_BEARER_TOKEN",
        "Accept": "application/json, text/event-stream"
      }
    }
  }
}
```

## Security Considerations
- **Authentication**: Constant-time comparison (`crypto.timingSafeEqual`) on Bearer tokens prevents timing attacks.
- **Least Privilege**: The Cloud Run service account should only have `roles/secretmanager.secretAccessor`.
- **Credential Masking**: Error outputs automatically redact database credentials and passwords.
- **Non-Root Execution**: The production Docker container executes as the non-root `node` user.
- **Environment Isolation**: `.dockerignore` and `.gitignore` strictly prevent `.env`, git history, and dev artifacts from entering production images.

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

