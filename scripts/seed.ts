import { loadEnv } from "./load-env";

async function main() {
  loadEnv();
  const { ensureAdmin } = await import("../src/lib/services/users");
  const { sqlClient } = await import("../src/lib/db");
  const admin = await ensureAdmin();
  console.log(admin ? `admin ready: ${admin.email}` : "ADMIN_EMAIL is not set");
  await sqlClient.end({ timeout: 5 });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
