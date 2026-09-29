import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { loadEnv } from "./load-env";

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const sql = postgres(url, { max: 1 });
  const dir = path.join(process.cwd(), "drizzle");
  const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();

  await sql.unsafe(
    "create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())",
  );
  const applied = await sql<{ id: string }[]>`select id from schema_migrations`;
  const done = new Set(applied.map((row) => row.id));

  for (const file of files) {
    if (done.has(file)) continue;
    const body = await readFile(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (id) values (${file})`;
    });
    console.log(`applied ${file}`);
  }

  await sql.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
