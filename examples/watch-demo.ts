/**
 * watch-demo.ts — QueryPilot qp watch demo simulator
 *
 * Simulates what a real Prisma app would send to the qp watch server.
 * Run this in one terminal while `qp watch` is running in another.
 *
 * Usage:
 *   Terminal 1: npx tsx src/index.ts watch
 *   Terminal 2: npx tsx examples/watch-demo.ts
 *
 * What this demonstrates:
 *  - Good queries (index scans)  → show green in the watch dashboard
 *  - Bad queries (seq scans)     → show red
 *  - Regression scenario         → first run fine, second run degrades
 *  - N+1 burst scenario          → 10 rapid identical queries (classic ORM anti-pattern)
 *  - Raw $queryRaw               → unnamed model, shows as "raw"
 */

import chalk from "chalk";

const WATCH_URL = "http://127.0.0.1:7432";

// ── Realistic query scenarios ─────────────────────────────────────────────────

const scenarios: Array<{
  label: string;
  event: {
    sql: string;
    model?: string;
    operation?: string;
    durationMs?: number;
    source?: string;
  };
  delayMs: number;
}> = [
  // 1. Simple PK lookup — index scan, fast
  {
    label: "User PK lookup (good — index scan)",
    delayMs: 600,
    event: {
      sql: 'SELECT "id", "email", "name", "createdAt" FROM "User" WHERE "id" = $1 LIMIT 1',
      model: "User",
      operation: "findUnique",
      durationMs: 1.2,
      source: "prisma",
    },
  },

  // 2. findMany with no WHERE — full table scan
  {
    label: "Users findMany — no filter (BAD — seq scan expected)",
    delayMs: 800,
    event: {
      sql: 'SELECT "id", "email", "name", "role", "createdAt", "updatedAt" FROM "User" ORDER BY "createdAt" DESC',
      model: "User",
      operation: "findMany",
      durationMs: 87.4,
      source: "prisma",
    },
  },

  // 3. Post with author JOIN — should use index on authorId
  {
    label: "Post.findMany with include author",
    delayMs: 700,
    event: {
      sql: `SELECT "Post"."id", "Post"."title", "Post"."content", "Post"."authorId", "Post"."createdAt",
  "User"."id" AS "User_id", "User"."name" AS "User_name", "User"."email" AS "User_email"
FROM "Post"
LEFT JOIN "User" ON "Post"."authorId" = "User"."id"
WHERE "Post"."published" = $1
ORDER BY "Post"."createdAt" DESC
LIMIT $2`,
      model: "Post",
      operation: "findMany",
      durationMs: 14.7,
      source: "prisma",
    },
  },

  // 4. N+1 burst — 10 rapid individual user lookups (classic ORM mistake)
  // These will fire quickly to simulate the N+1 pattern
  ...Array.from({ length: 10 }, (_, i) => ({
    label: `N+1 burst query ${i + 1}/10`,
    delayMs: 120,
    event: {
      sql: `SELECT "id", "name", "email" FROM "User" WHERE "id" = $1`,
      model: "User",
      operation: "findUnique",
      durationMs: 0.8 + Math.random() * 2,
      source: "prisma",
    },
  })),

  // 5. A raw $queryRaw — no model attached
  {
    label: "Raw analytics aggregation query",
    delayMs: 900,
    event: {
      sql: `SELECT
  DATE_TRUNC('day', "createdAt") AS day,
  COUNT(*) AS post_count,
  COUNT(DISTINCT "authorId") AS unique_authors
FROM "Post"
WHERE "createdAt" > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1 DESC`,
      source: "prisma",
      durationMs: 42.1,
    },
  },

  // 6. Aggregation — COUNT with WHERE on unindexed column
  {
    label: "Count posts by status (unindexed column)",
    delayMs: 700,
    event: {
      sql: `SELECT "status", COUNT(*) AS "count" FROM "Post" WHERE "status" = $1 GROUP BY "status"`,
      model: "Post",
      operation: "groupBy",
      durationMs: 55.3,
      source: "prisma",
    },
  },

  // 7. REGRESSION scenario — same query as scenario 3 but now with a huge table
  //    (simulated by adding CROSS JOIN to bump up cost artificially in the SQL plan)
  {
    label: "Post.findMany REGRESSION (simulate data growth)",
    delayMs: 1000,
    event: {
      sql: `SELECT "Post"."id", "Post"."title", "Post"."content", "Post"."authorId", "Post"."createdAt",
  "User"."id" AS "User_id", "User"."name" AS "User_name", "User"."email" AS "User_email"
FROM "Post"
LEFT JOIN "User" ON "Post"."authorId" = "User"."id"
WHERE "Post"."published" = $1
ORDER BY "Post"."createdAt" DESC
LIMIT $2`,
      model: "Post",
      operation: "findMany",
      durationMs: 340.1, // same query but app timing is way worse now
      source: "prisma",
    },
  },

  // 8. A Drizzle-sourced query (different source label)
  {
    label: "Drizzle ORM query (cross-ORM demo)",
    delayMs: 700,
    event: {
      sql: `SELECT u.id, u.email, COUNT(p.id) AS post_count
FROM users u
LEFT JOIN posts p ON p.author_id = u.id
GROUP BY u.id, u.email
HAVING COUNT(p.id) > 5
ORDER BY post_count DESC
LIMIT 20`,
      source: "drizzle",
      durationMs: 18.9,
    },
  },

  // 9. Clean PK lookup — should show as new baseline
  {
    label: "Comment lookup by post (indexed FK)",
    delayMs: 600,
    event: {
      sql: `SELECT "id", "body", "authorId", "postId", "createdAt" FROM "Comment" WHERE "postId" = $1 ORDER BY "createdAt" ASC`,
      model: "Comment",
      operation: "findMany",
      durationMs: 3.1,
      source: "prisma",
    },
  },
];

// ── Helper functions ──────────────────────────────────────────────────────────

async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${WATCH_URL}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendQuery(event: (typeof scenarios)[0]["event"]): Promise<void> {
  try {
    await fetch(`${WATCH_URL}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    console.error(chalk.red("  ✖ Could not reach watch server"));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(chalk.bold.cyan("\n  QueryPilot Watch — Demo Simulator\n"));

  // Health check
  console.log(chalk.dim("  Checking if qp watch is running..."));
  const healthy = await checkServerHealth();

  if (!healthy) {
    console.log(
      chalk.red(
        "\n  ✖ qp watch server is not running on port 7432.\n" +
          "    Start it first:\n\n" +
          chalk.bold("      npx tsx src/index.ts watch\n") +
          "\n    Then re-run this demo in a second terminal.\n",
      ),
    );
    process.exit(1);
  }

  console.log(chalk.green("  ✔ Watch server is live\n"));
  console.log(
    chalk.dim(
      `  Sending ${scenarios.length} query events across ${
        Math.round(scenarios.reduce((s, x) => s + x.delayMs, 0) / 1000)
      }s...\n`,
    ),
  );

  for (const scenario of scenarios) {
    console.log(chalk.dim(`  → ${scenario.label}`));
    await sendQuery(scenario.event);
    await sleep(scenario.delayMs);
  }

  console.log(chalk.green("\n  ✔ All demo queries sent.\n"));
  console.log(
    chalk.dim(
      "  Check the qp watch terminal for the full analysis dashboard.\n" +
        "  Press Ctrl+C there to see the session summary.\n",
    ),
  );
}

void main();
