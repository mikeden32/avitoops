import { loadEnv } from "./load-env";

loadEnv();

const base = process.env.AGENT_SITE_URL || "http://127.0.0.1:3000";
const key = process.env.INTERNAL_API_KEY;

async function cycle() {
  if (!key) throw new Error("INTERNAL_API_KEY is required");
  const response = await fetch(`${base}/api/internal/agent/cycle`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text.slice(0, 200));
  console.log(text);
}

async function main() {
  console.log("grok-avitolog started");
  const once = process.argv.includes("--once");
  do {
    try {
      await cycle();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      if (once) process.exit(1);
    }
    if (once) return;
    await new Promise((resolve) => setTimeout(resolve, 20000));
  } while (!once);
}

main();
