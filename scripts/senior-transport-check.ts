import { askGrok, GrokCallError, resolveSeniorTransport, seniorConfigured, speakGrok } from "../src/lib/grok";

const ENV_KEYS = ["OPSI_BASE_URL", "OPSI_SERVICE_TOKEN", "XAI_API_KEY", "XAI_MODEL"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function check(name: string, ok: boolean) {
  if (!ok) throw new Error(name);
  console.log(`ok ${name}`);
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
}

async function main() {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  let sawDirect = false;
  let sawOpsi = false;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("api.x.ai")) sawDirect = true;
    if (url.includes("/v1/senior")) sawOpsi = true;
    const headers = new Headers(init?.headers);
    if (url.endsWith("/v1/senior")) {
      const auth = headers.get("authorization") ?? "";
      check("A bearer is present without logging it", auth === "Bearer test-opsi-token");
      const body = JSON.parse(String(init?.body));
      check(
        "A payload is only the senior contract",
        body.agent === "avito-specialist" &&
          body.task === "senior_completion" &&
          body.messages?.[0]?.content === "system" &&
          body.messages?.[1]?.content === "user" &&
          !("password" in body) &&
          !("cookie" in body),
      );
      return new Response(JSON.stringify({ ok: true, content: " да ", provider: "xai", model: "grok-4.6", requestId: "req-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/chat/completions")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: "готов" } }] }), { status: 200 });
    }
    if (url.includes("/tts")) {
      return new Response(new Uint8Array(120), { status: 200, headers: { "content-type": "audio/mpeg" } });
    }
    return new Response("no", { status: 500 });
  };

  try {
    setEnv({ OPSI_BASE_URL: "https://ai.avitoops.ru/", OPSI_SERVICE_TOKEN: "test-opsi-token", XAI_API_KEY: "dev-key" });
    check("A transport is opsi", resolveSeniorTransport() === "opsi" && seniorConfigured());
    calls.length = 0;
    sawDirect = false;
    const answer = await askGrok("system", "user");
    check("A askGrok uses OPSI and returns trimmed content", answer === "да" && calls.length === 1 && calls[0] === "https://ai.avitoops.ru/v1/senior" && !sawDirect);

    setEnv({ OPSI_BASE_URL: "https://ai.avitoops.ru", XAI_API_KEY: "dev-key" });
    check("B partial URL is invalid", resolveSeniorTransport() === "invalid" && !seniorConfigured());
    calls.length = 0;
    sawDirect = false;
    let configError = false;
    try {
      await askGrok("system", "user");
    } catch (error) {
      configError = error instanceof GrokCallError && error.providerErrorCode === "opsi_config" && calls.length === 0 && !sawDirect;
    }
    check("B does not fall back to direct xAI", configError);

    setEnv({ OPSI_SERVICE_TOKEN: "test-opsi-token", XAI_API_KEY: "dev-key" });
    check("C partial token is invalid", resolveSeniorTransport() === "invalid" && !seniorConfigured());
    calls.length = 0;
    sawDirect = false;
    configError = false;
    try {
      await askGrok("system", "user");
    } catch (error) {
      configError = error instanceof GrokCallError && error.providerErrorCode === "opsi_config" && calls.length === 0 && !sawDirect;
    }
    check("C does not fall back to direct xAI", configError);

    setEnv({ XAI_API_KEY: "dev-key" });
    check("D direct dev fallback", resolveSeniorTransport() === "xai" && seniorConfigured());
    calls.length = 0;
    sawOpsi = false;
    const direct = await askGrok("system", "user");
    check("D askGrok uses api.x.ai", direct === "готов" && calls.length === 1 && calls[0] === "https://api.x.ai/v1/chat/completions" && !sawOpsi);

    setEnv({});
    check("E nothing is unavailable", resolveSeniorTransport() === "unavailable" && !seniorConfigured());
    calls.length = 0;
    const missing = await askGrok("system", "user");
    check("E askGrok does not call the network", missing === null && calls.length === 0);

    setEnv({ OPSI_BASE_URL: "https://ai.avitoops.ru", OPSI_SERVICE_TOKEN: "test-opsi-token", XAI_API_KEY: "dev-key" });
    calls.length = 0;
    sawDirect = false;
    const audio = await speakGrok("Проверка голоса для объявления бани в Подольске.");
    check("F speakGrok skips direct TTS when OPSI is configured", audio === null && calls.length === 0 && !sawDirect);

    setEnv({ OPSI_BASE_URL: "https://ai.avitoops.ru", OPSI_SERVICE_TOKEN: "test-opsi-token", XAI_API_KEY: "dev-key" });
    calls.length = 0;
    globalThis.fetch = async (input) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ ok: false, requestId: "req-9", error: { type: "unauthorized", code: "unauthorized" } }), { status: 401 });
    };
    let auth = false;
    try {
      await askGrok("system", "user");
    } catch (error) {
      auth = error instanceof GrokCallError && error.providerErrorType === "auth" && error.providerStatus === 401 && error.providerRequestId === "req-9" && calls.length === 1 && !calls[0].includes("api.x.ai");
    }
    check("OPSI 401 stays on OPSI and is auth", auth);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
  console.log("senior transport check passed");
}

main().catch((error) => {
  restoreEnv();
  console.error(error instanceof Error ? error.message : "senior transport check failed");
  process.exit(1);
});
