import { resetLiteCircuit } from "../src/lib/ai/circuit";
import { liteConfig } from "../src/lib/ai/config";
import { cloudruLiteClient } from "../src/lib/ai/cloudru-lite";
import { LiteCallError } from "../src/lib/ai/groq-lite";
import { LISTING_FACTS_JSON_SCHEMA, mergeListingFacts, rulesNeedSenior, type ListingFacts } from "../src/lib/ai/listing-facts";
import { routeListingExtraction, type AiProvider } from "../src/lib/ai/router";
import type { LiteConfig } from "../src/lib/ai/config";
import type { LiteClient } from "../src/lib/ai/groq-lite";
import { applyFacts, composeTask, emptyFacts } from "../src/lib/services/sale";

const base: LiteConfig = {
  enabled: true,
  shadow: true,
  sampleRate: 1,
  provider: "cloudru",
  model: "ai-sage/GigaChat3-10B-A1.8B",
  baseUrl: "https://foundation-models.api.cloud.ru/v1",
  timeoutMs: 3500,
  failureThreshold: 5,
  cooldownMs: 60_000,
  retryAfterMs: 1000,
};

function check(name: string, ok: boolean) {
  if (!ok) throw new Error(name);
  console.log(`ok ${name}`);
}

function facts(patch: Partial<ListingFacts> = {}): ListingFacts {
  return {
    intent: "create_listing",
    product: null,
    price: null,
    currency: "RUB",
    locations: [],
    attributes: { dimensions: null, delivery: null },
    missingFields: [],
    confidence: 0.8,
    needsSenior: false,
    ...patch,
  };
}

function clientOf(body: unknown, calls: { n: number; user: string }): LiteClient {
  return async (input) => {
    calls.n += 1;
    calls.user = input.user;
    return { raw: JSON.stringify(body), status: 200, inputTokens: 12, outputTokens: 30 };
  };
}

function failing(kind: LiteCallError["kind"], status: number, calls: { n: number }): LiteClient {
  return async () => {
    calls.n += 1;
    throw new LiteCallError(kind, status);
  };
}

async function main() {
  resetLiteCircuit();
  const logs: string[] = [];
  const previousLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };

  try {
    check("schema is closed", LISTING_FACTS_JSON_SCHEMA.additionalProperties === false && LISTING_FACTS_JSON_SCHEMA.required.includes("needsSenior"));

    const bathText = "Продаю каркасную баню 6×2,4 за 570 000 ₽. Москва и область";
    const rulesCard = composeTask(applyFacts(emptyFacts(), bathText));
    check("rules still read the bath", rulesCard.product === "каркасная баня 6×2,4" && rulesCard.price === 570000 && rulesCard.location === "Москва и Московская область");

    const bath = facts({
      product: "каркасная баня 6×2,4",
      price: 570000,
      locations: ["Москва", "Московская область"],
      attributes: { dimensions: "6×2,4", delivery: true },
    });
    const bathCalls = { n: 0, user: "" };
    const shadow = await routeListingExtraction({
      text: bathText,
      config: base,
      client: clientOf(bath, bathCalls),
      rules: rulesCard,
    });
    const rulesAfter = composeTask(applyFacts(emptyFacts(), bathText));
    check("shadow does not change the card", shadow.apply === false && JSON.stringify(rulesCard) === JSON.stringify(rulesAfter));
    check("shadow still observed", bathCalls.n === 1 && shadow.provider === "cloudru-lite" && shadow.apply === false);

    const liveCalls = { n: 0, user: "" };
    const live = await routeListingExtraction({
      text: bathText,
      config: { ...base, shadow: false },
      client: clientOf(bath, liveCalls),
    });
    check(
      "live bath card",
      live.apply === true &&
        live.task?.product === "каркасная баня 6×2,4" &&
        live.task.price === 570000 &&
        live.task.location === "Москва и Московская область" &&
        live.task.attributes.size === "6×2,4" &&
        live.task.attributes.delivery === "да" &&
        (live.reply ?? "").includes("570 000") &&
        !(live.reply ?? "").includes("Groq"),
    );

    const podolsk = facts({ product: "баня", price: 500000, locations: ["Подольск"] });
    const podolskRoute = await routeListingExtraction({
      text: "баня, Подольск, 500000",
      config: { ...base, shadow: false },
      client: clientOf(podolsk, { n: 0, user: "" }),
    });
    check("podolsk listing", podolskRoute.apply === true && podolskRoute.task?.location === "Подольск" && podolskRoute.task.price === 500000);

    const houses = facts({ product: "каркасные дома", price: 1800000, locations: ["Москва", "Московская область"] });
    const housesRoute = await routeListingExtraction({
      text: "каркасные дома, Москва и МО, от 1.8 млн",
      config: { ...base, shadow: false },
      client: clientOf(houses, { n: 0, user: "" }),
    });
    check("houses region and price", housesRoute.task?.price === 1800000 && housesRoute.task.location === "Москва и Московская область");

    const power = facts({
      product: "рефконтейнеры",
      price: 59000,
      locations: ["Чехов"],
      needsSenior: true,
    });
    const powerRoute = await routeListingExtraction({
      text: "рефконтейнеры, Чехов, 59000, нужно электричество",
      config: { ...base, shadow: false },
      client: clientOf(power, { n: 0, user: "" }),
    });
    check("electricity stays with senior", powerRoute.apply === false && powerRoute.escalation === "senior" && powerRoute.facts?.price === 59000);

    const strategyCalls = { n: 0 };
    const strategy = await routeListingExtraction({
      text: "какая стратегия цены будет выгоднее конкурентов",
      config: { ...base, shadow: false },
      client: failing("timeout", 0, strategyCalls),
    });
    check("strategy goes to senior", strategy.apply === false && strategy.provider === ("grok-senior" satisfies AiProvider) && strategy.escalation === "strategy" && strategyCalls.n === 0);

    const strategyPhrases = [
      "Проанализируй конкурентов и предложи стратегию цены",
      "Какую цену мне лучше поставить?",
      "Как быстрее продать эту баню?",
      "Что сделать, чтобы обойти конкурентов?",
    ];
    const healthyCalls = { n: 0 };
    for (const phrase of strategyPhrases) {
      const route = await routeListingExtraction({
        text: phrase,
        config: base,
        client: failing("timeout", 0, healthyCalls),
      });
      check(
        `strategy while lite healthy: ${phrase}`,
        rulesNeedSenior(phrase) && route.apply === false && route.provider === "grok-senior" && route.escalation === "strategy",
      );
    }
    check("healthy strategy never calls lite", healthyCalls.n === 0);

    resetLiteCircuit();
    const openCalls = { n: 0 };
    const openClient = failing("server", 503, openCalls);
    for (let i = 0; i < 5; i += 1) {
      await routeListingExtraction({ text: "баня в Подольске за 500000", config: base, client: openClient });
    }
    const duringOutage = await routeListingExtraction({
      text: strategyPhrases[0],
      config: base,
      client: openClient,
    });
    check(
      "strategy while lite circuit open",
      duringOutage.apply === false && duringOutage.provider === "grok-senior" && duringOutage.escalation === "strategy" && openCalls.n === 5,
    );

    resetLiteCircuit();
    const missingCalls = { n: 0 };
    const missing = await routeListingExtraction({
      text: strategyPhrases[1],
      config: { ...base, enabled: false },
      client: failing("timeout", 0, missingCalls),
    });
    const missingLog = logs.at(-1) ?? "";
    check(
      "strategy while lite key missing",
      missing.apply === false && missing.provider === "grok-senior" && missing.escalation === "strategy" && missingCalls.n === 0,
    );
    check(
      "missing key still logs senior",
      missingLog.includes('"provider":"grok-senior"') && missingLog.includes('"escalation":"strategy"'),
    );

    resetLiteCircuit();
    const forbiddenCalls = { n: 0 };
    const forbidden = await routeListingExtraction({
      text: "Продаю баню в Подольске за 500000",
      config: { ...base, shadow: false },
      client: async () => {
        forbiddenCalls.n += 1;
        throw new LiteCallError("permission", 403, {
          type: "permissions_error",
          code: "model_permission",
          message: "model not allowed gsk_secretvalue",
        });
      },
    });
    const forbiddenLog = logs.at(-1) ?? "";
    check(
      "403 falls back without apply",
      forbidden.apply === false && forbidden.provider === "rules" && forbidden.fallbackUsed && forbidden.escalation === "permission",
    );
    check(
      "403 classified permission",
      forbiddenLog.includes('"error":"permission"') &&
        forbiddenLog.includes('"status":403') &&
        forbiddenLog.includes('"errorType":"permissions_error"') &&
        forbiddenLog.includes('"errorCode":"model_permission"') &&
        !forbiddenLog.includes('"error":"server"') &&
        !forbiddenLog.includes("gsk_secretvalue") &&
        !forbiddenLog.includes("Продаю баню"),
    );
    const afterForbidden = await routeListingExtraction({
      text: "Продаю баню в Подольске за 500000",
      config: { ...base, shadow: false },
      client: async () => {
        forbiddenCalls.n += 1;
        throw new LiteCallError("permission", 403);
      },
    });
    check("403 opens the circuit at once", forbiddenCalls.n === 1 && afterForbidden.apply === false && afterForbidden.escalation === "circuit");

    const kept = mergeListingFacts(
      { product: "баня", location: "Москва", price: 570000, confirmed: true },
      facts({ intent: "edit_listing", product: "дом", price: 100000, locations: ["Тула"] }),
      "уточни срок",
    );
    check("inference does not erase a draft", kept.product === "баня" && kept.price === 570000 && kept.location === "Москва" && kept.conflict);

    const edited = mergeListingFacts(
      { product: "баня", location: "Москва", price: 570000, confirmed: true },
      facts({ intent: "edit_listing", product: "баня", price: 490000, locations: ["Москва"] }),
      "исправь цену на 490000",
    );
    check("explicit price edit updates", edited.price === 490000 && edited.conflict === false && edited.product === "баня");

    const blank = mergeListingFacts(
      { product: "баня", location: "Подольск", price: 500000, confirmed: true },
      facts(),
      "добавь подробности позже",
    );
    check("null does not erase", blank.product === "баня" && blank.location === "Подольск" && blank.price === 500000 && blank.conflict === false);

    resetLiteCircuit();
    const timeoutCalls = { n: 0 };
    const timeout = await routeListingExtraction({
      text: "баня в Подольске за 500000",
      config: { ...base, shadow: false },
      client: failing("timeout", 0, timeoutCalls),
    });
    check("timeout falls back", timeout.apply === false && timeout.fallbackUsed && timeout.escalation === "timeout" && timeout.provider === "rules");

    const rate = await routeListingExtraction({
      text: "баня в Подольске за 500000",
      config: { ...base, shadow: false },
      client: failing("rate", 429, { n: 0 }),
    });
    check("rate limit falls back", rate.apply === false && rate.fallbackUsed && rate.escalation === "rate");

    const broken = await routeListingExtraction({
      text: "баня в Подольске за 500000",
      config: { ...base, shadow: false },
      client: async () => ({ raw: "{", status: 200 }),
    });
    check("bad schema falls back", broken.apply === false && broken.escalation === "schema");

    resetLiteCircuit();
    const disabledCalls = { n: 0 };
    const disabled = await routeListingExtraction({
      text: bathText,
      config: { ...base, enabled: false },
      client: failing("timeout", 0, disabledCalls),
    });
    check("disabled lite stays on rules", disabled.apply === false && disabled.provider === "rules" && disabledCalls.n === 0);

    resetLiteCircuit();
    const circuitCalls = { n: 0 };
    const circuitClient = failing("server", 503, circuitCalls);
    for (let i = 0; i < 5; i += 1) {
      await routeListingExtraction({ text: "баня", config: base, client: circuitClient });
    }
    const skipped = await routeListingExtraction({ text: "баня", config: base, client: circuitClient });
    check("circuit opens", circuitCalls.n === 5 && skipped.escalation === "circuit" && skipped.apply === false);

    const sampled = { n: 0 };
    const sample = await routeListingExtraction({
      text: bathText,
      config: { ...base, sampleRate: 0 },
      sample: 0.5,
      client: failing("timeout", 0, sampled),
    });
    check("shadow sample can skip", sample.apply === false && sampled.n === 0);

    const secretCalls = { n: 0, user: "" };
    await routeListingExtraction({
      text: "Продаю баню в Подольске за 500000. ivan@example.com password=secret",
      config: base,
      client: clientOf(facts({ product: "баня", price: 500000, locations: ["Подольск"] }), secretCalls),
    });
    check("payload hides mail and password", !secretCalls.user.includes("ivan@example.com") && !secretCalls.user.includes("password=secret"));
    check("logs hide mail and password", !logs.join("\n").includes("ivan@example.com") && !logs.join("\n").includes("password=secret"));

    const savedKey = process.env.CLOUDRU_API_KEY;
    process.env.CLOUDRU_API_KEY = "test-key";
    const originalFetch = globalThis.fetch;
    let hits = 0;
    let lastUrl = "";
    let lastBody = "";
    globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
      hits += 1;
      lastUrl = String(url);
      lastBody = String(init?.body ?? "");
      if (hits === 1) return new Response("busy", { status: 429, headers: { "retry-after": "0" } });
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(bath) } }], usage: { prompt_tokens: 4, completion_tokens: 6 } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;
    const retried = await cloudruLiteClient(base)({ system: "s", user: "u", timeoutMs: 1000 });
    check("short 429 retries once", hits === 2 && retried.inputTokens === 4);
    check(
      "cloudru request is structured and has no groq reasoning flag",
      lastUrl === "https://foundation-models.api.cloud.ru/v1/chat/completions" &&
        lastBody.includes('"type":"json_schema"') &&
        lastBody.includes("ai-sage/GigaChat3-10B-A1.8B") &&
        !lastBody.includes("reasoning_effort") &&
        !lastBody.includes("test-key"),
    );

    hits = 0;
    globalThis.fetch = (async () => {
      hits += 1;
      return new Response("busy", { status: 429, headers: { "retry-after": "30" } });
    }) as typeof fetch;
    let rateKind = "";
    try {
      await cloudruLiteClient(base)({ system: "s", user: "u", timeoutMs: 1000 });
    } catch (error) {
      rateKind = error instanceof LiteCallError ? error.kind : "other";
    }
    check("long 429 does not loop", hits === 1 && rateKind === "rate");

    globalThis.fetch = (async () => {
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    }) as typeof fetch;
    let timeoutKind = "";
    try {
      await cloudruLiteClient(base)({ system: "s", user: "u", timeoutMs: 1000 });
    } catch (error) {
      timeoutKind = error instanceof LiteCallError ? error.kind : "other";
    }
    check("timeout is a lite error", timeoutKind === "timeout");

    const classified: { kind: string; status: number; hits: number; message?: string }[] = [];
    async function classify(status: number, body: string) {
      let hits = 0;
      globalThis.fetch = (async () => {
        hits += 1;
        return new Response(body, { status, headers: { "Content-Type": "application/json" } });
      }) as typeof fetch;
      try {
        await cloudruLiteClient(base)({ system: "s", user: "u", timeoutMs: 1000 });
        classified.push({ kind: "ok", status, hits });
      } catch (error) {
        classified.push({
          kind: error instanceof LiteCallError ? error.kind : "other",
          status: error instanceof LiteCallError ? error.status : 0,
          hits,
          message: error instanceof LiteCallError ? error.errorMessage : undefined,
        });
      }
    }
    await classify(403, JSON.stringify({ error: { message: "Forbidden", type: "permissions_error", code: "model_permission" } }));
    await classify(429, JSON.stringify({ error: { message: "rate", type: "rate_limit", code: "rate_limit" } }));
    await classify(503, JSON.stringify({ error: { message: "down", type: "server_error", code: "internal" } }));
    await classify(401, JSON.stringify({ error: { message: "bad key gsk_secretvalue", type: "auth_error", code: "invalid_api_key" } }));
    await classify(408, JSON.stringify({ error: { message: "slow", type: "timeout", code: "timeout" } }));
    check("fetch 403 is permission and is not retried", classified[0]?.kind === "permission" && classified[0].status === 403 && classified[0].hits === 1);
    check("fetch 429 is rate", classified[1]?.kind === "rate" && classified[1].hits === 2);
    check("fetch 5xx is server", classified[2]?.kind === "server" && classified[2].status === 503);
    check("fetch 401 is auth", classified[3]?.kind === "auth" && classified[3].message === "bad key [key]");
    check("fetch 408 is timeout", classified[4]?.kind === "timeout" && classified[4].status === 408);

    globalThis.fetch = originalFetch;
    if (savedKey === undefined) delete process.env.CLOUDRU_API_KEY;
    else process.env.CLOUDRU_API_KEY = savedKey;

    const savedEnabled = process.env.AI_LITE_ENABLED;
    const savedShadow = process.env.AI_LITE_SHADOW_MODE;
    const savedProvider = process.env.AI_LITE_PROVIDER;
    const savedCloudModel = process.env.CLOUDRU_LITE_MODEL;
    const savedGroqKey = process.env.GROQ_API_KEY;
    const savedGroqModel = process.env.GROQ_LITE_MODEL;
    delete process.env.AI_LITE_ENABLED;
    delete process.env.AI_LITE_SHADOW_MODE;
    delete process.env.AI_LITE_PROVIDER;
    delete process.env.CLOUDRU_LITE_MODEL;
    process.env.CLOUDRU_API_KEY = "test-key";
    const configured = liteConfig();
    check(
      "config defaults to shadow cloudru",
      configured.enabled &&
        configured.shadow &&
        configured.provider === "cloudru" &&
        configured.model === "ai-sage/GigaChat3-10B-A1.8B" &&
        configured.baseUrl === "https://foundation-models.api.cloud.ru/v1" &&
        configured.timeoutMs === 3500,
    );
    process.env.AI_LITE_PROVIDER = "groq";
    process.env.GROQ_API_KEY = "test-key";
    process.env.GROQ_LITE_MODEL = "openai/gpt-oss-20b";
    const groqConfigured = liteConfig();
    check(
      "groq adapter stays selectable",
      groqConfigured.provider === "groq" && groqConfigured.model === "openai/gpt-oss-20b" && groqConfigured.baseUrl === "https://api.groq.com/openai/v1",
    );
    process.env.AI_LITE_ENABLED = "false";
    check("explicit disable stays off", liteConfig().enabled === false);
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore("AI_LITE_ENABLED", savedEnabled);
    restore("AI_LITE_SHADOW_MODE", savedShadow);
    restore("AI_LITE_PROVIDER", savedProvider);
    restore("CLOUDRU_LITE_MODEL", savedCloudModel);
    restore("GROQ_LITE_MODEL", savedGroqModel);
    if (savedKey === undefined) delete process.env.CLOUDRU_API_KEY;
    else process.env.CLOUDRU_API_KEY = savedKey;
    if (savedGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = savedGroqKey;

    console.log = previousLog;
    console.log("ai router check passed");
  } catch (error) {
    console.log = previousLog;
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "ai router check failed");
  process.exit(1);
});
