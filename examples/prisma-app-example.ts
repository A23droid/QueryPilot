/**
 * prisma-app-example.ts — Real-world QueryPilot integration example
 *
 * This shows exactly how you'd wire QueryPilot into a real
 * Next.js / Express / Fastify app that uses Prisma.
 *
 * In a real project, this file would be: lib/db.ts or src/lib/prisma.ts
 *
 * NOTE: This file won't run as-is (it needs @prisma/client installed and
 * a schema generated). It's a reference for copy-pasting into your app.
 */

// ─── 1. Your normal Prisma setup ─────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { attachQueryPilot } from "../src/middleware/prismaPlugin.js";

// KEY: you must add the log config to emit query events
// Without `{ emit: 'event', level: 'query' }`, Prisma won't fire the hook.
const baseClient = new PrismaClient({
  log: [
    { emit: "event", level: "query" }, // ← required for qp watch
    { emit: "stdout", level: "error" },
    { emit: "stdout", level: "warn" },
  ],
});

// ─── 2. Wrap it with QueryPilot ───────────────────────────────────────────────

export const prisma = attachQueryPilot(baseClient, {
  // Optional: only analyze queries slower than 5ms (reduces noise)
  minDurationMs: 0,

  // Optional: hook into regressions from your app's own logger
  onRegression: ({ sql, model, operation, pctChange, planCost, baseline }) => {
    console.warn(
      `[QueryPilot] ⚡ REGRESSION detected on ${model ?? "raw"}.${operation ?? "query"}: ` +
        `cost ${planCost.toFixed(1)} vs baseline ${baseline.toFixed(1)} (+${pctChange.toFixed(1)}%)\n` +
        `  SQL: ${sql.slice(0, 80)}...`,
    );
    // You could also send this to Datadog, Sentry, Slack webhook, etc.
  },
});

// ─── 3. Use prisma normally — QueryPilot is completely transparent ────────────

async function exampleUsage() {
  // All of these get intercepted automatically:

  // Good — PK lookup, will show as "Index Scan" in qp watch
  const user = await prisma.user.findUnique({
    where: { id: "user_abc123" },
  });

  // Potentially bad — no WHERE clause, may trigger Seq Scan warning
  const allUsers = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // JOIN — qp watch shows the exact SQL Prisma generates for nested includes
  const postsWithAuthors = await prisma.post.findMany({
    where: { published: true },
    include: { author: true, _count: { select: { comments: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Raw query — shows up in qp watch as source:"prisma", no model attached
  const stats = await prisma.$queryRaw`
    SELECT DATE_TRUNC('day', "createdAt") as day, COUNT(*) as count
    FROM "Post"
    WHERE "createdAt" > NOW() - INTERVAL '7 days'
    GROUP BY 1
    ORDER BY 1 DESC
  `;

  return { user, allUsers, postsWithAuthors, stats };
}

// ─── 4. For Next.js: singleton pattern to avoid hot-reload issues ─────────────

// In Next.js dev mode, hot reloads can create many PrismaClient instances.
// Use the global singleton pattern:

declare global {
  // eslint-disable-next-line no-var
  var __prisma: ReturnType<typeof attachQueryPilot<PrismaClient>> | undefined;
}

function getPrismaClient() {
  if (!globalThis.__prisma) {
    const client = new PrismaClient({
      log: [{ emit: "event", level: "query" }],
    });
    globalThis.__prisma = attachQueryPilot(client, {
      onRegression: ({ model, operation, pctChange }) => {
        if (process.env.NODE_ENV === "development") {
          console.warn(`[QP] Regression: ${model}.${operation} +${pctChange}%`);
        }
      },
    });
  }
  return globalThis.__prisma;
}

// For Next.js, export this instead:
export const nextjsPrisma = getPrismaClient();
