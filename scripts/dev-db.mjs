import EmbeddedPostgres from "embedded-postgres";
import os from "node:os";
import path from "node:path";

const port = 54329;
const databaseDir = path.join(os.homedir(), ".avitoops", "pg");
const pg = new EmbeddedPostgres({
  databaseDir,
  user: "avitoops",
  password: "avitoops",
  port,
  persistent: true,
});

await pg.initialise();
await pg.start();
try {
  await pg.createDatabase("avitoops");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!/already exists/i.test(message)) throw error;
}

console.log(`postgres ready on 127.0.0.1:${port}/avitoops`);
await new Promise(() => {});
