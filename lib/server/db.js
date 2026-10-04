import { neon } from "@neondatabase/serverless";

let sqlClient;

export function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    const error = new Error("DATABASE_URL is not configured.");
    error.status = 503;
    throw error;
  }
  if (!sqlClient) sqlClient = neon(url);
  return sqlClient;
}
