import { redact } from "../redact";
import type { LiteConfig } from "./config";
import { EXTRACTION_SYSTEM_PROMPT, LISTING_FACTS_JSON_SCHEMA, type KnownFacts } from "./listing-facts";

export class LiteCallError extends Error {
  constructor(
    readonly kind: "timeout" | "rate" | "server" | "network" | "schema" | "unavailable",
    readonly status: number,
  ) {
    super(kind);
  }
}

export type LiteCompletion = {
  raw: string;
  status: number;
  inputTokens?: number;
  outputTokens?: number;
};

export type LiteClient = (input: { system: string; user: string; timeoutMs: number }) => Promise<LiteCompletion>;

function liteUserText(text: string, known?: KnownFacts) {
  const clean = redact(text)
    .replace(/(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g, "[phone]")
    .slice(0, 800);
  const brief = {
    product: known?.product ?? null,
    location: known?.location ?? null,
    price: known?.price ?? null,
  };
  return `Известно: ${JSON.stringify(brief)}\nСообщение: ${clean}`;
}

export function groqLiteClient(config: LiteConfig): LiteClient {
  return async ({ system, user, timeoutMs }) => completeGroq(config, system, user, timeoutMs, false);
}

async function completeGroq(config: LiteConfig, system: string, user: string, timeoutMs: number, retried: boolean): Promise<LiteCompletion> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new LiteCallError("unavailable", 0);
  let response: Response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        reasoning_effort: "low",
        stream: false,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "listing_facts",
            strict: true,
            schema: LISTING_FACTS_JSON_SCHEMA,
          },
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") throw new LiteCallError("timeout", 0);
    throw new LiteCallError("network", 0);
  }
  if (response.status === 429 && !retried) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 0;
    if (waitMs <= config.retryAfterMs) {
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      return completeGroq(config, system, user, timeoutMs, true);
    }
  }
  if (response.status === 429) throw new LiteCallError("rate", 429);
  if (response.status === 404 || response.status === 400) throw new LiteCallError("unavailable", response.status);
  if (response.status >= 500) throw new LiteCallError("server", response.status);
  if (!response.ok) throw new LiteCallError("server", response.status);
  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new LiteCallError("schema", response.status);
  return {
    raw,
    status: response.status,
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
  };
}

export function extractionRequest(text: string, known?: KnownFacts) {
  return {
    system: EXTRACTION_SYSTEM_PROMPT,
    user: liteUserText(text, known),
  };
}
