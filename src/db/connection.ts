import "dotenv/config";
import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ||
  (process.env.NODE_ENV === "test" || process.env.CI
    ? "postgresql://postgres:postgres@localhost:5432/querypilot_test"
    : undefined);

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is missing");
}

export const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 5000,
  max: 3,
});
