import { loadEnv } from "./load-env";

loadEnv();

async function main() {
  const { cleanupGuestDrafts } = await import("../src/lib/services/guest-draft");
  const { sqlClient } = await import("../src/lib/db");
  const result = await cleanupGuestDrafts();
  console.log(`guest drafts removed: expired ${result.expired}, claimed ${result.settled}`);
  await sqlClient.end({ timeout: 5 });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "guest draft cleanup failed");
  process.exit(1);
});
