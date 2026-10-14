import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing from .env");
}

export const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 5000,
  max: 3,
});
