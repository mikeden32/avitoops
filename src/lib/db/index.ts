import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  return postgres(url, { max: 10 });
}

export const sqlClient = globalForDb.pg ?? createClient();
if (process.env.NODE_ENV !== "production") {
  globalForDb.pg = sqlClient;
}

export const db = drizzle(sqlClient, { schema });
export type Database = typeof db;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
