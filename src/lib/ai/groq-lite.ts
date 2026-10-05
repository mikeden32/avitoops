import { redact } from "../redact";
import type { LiteConfig } from "./config";
import { EXTRACTION_SYSTEM_PROMPT, LISTING_FACTS_JSON_SCHEMA, type KnownFacts } from "./listing-facts";

export type LiteErrorKind = "timeout" | "rate" | "server" | "network" | "schema" | "unavailable" | "permission" | "auth";

export type LiteErrorDetail = {
  type?: string;
  code?: string;
  message?: string;
};

export class LiteCallError extends Error {
  readonly errorType?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  thinkingDisabled?: boolean;

  constructor(
    readonly kind: LiteErrorKind,
    readonly status: number,
    detail?: LiteErrorDetail,
  ) {
    super(kind);
    this.errorType = providerText(detail?.type);
    this.errorCode = providerText(detail?.code);
    this.errorMessage = providerText(detail?.message);
  }
}

function providerText(value: unknown) {
  if (typeof value !== "string") return undefined;
  let clean = redact(value)
    .replace(/bearer\s+\S+/gi, "bearer [redacted]")
    .replace(/\bgsk_[A-Za-z0-9_-]+/g, "[key]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "[key]");
  for (const secret of [process.env.GROQ_API_KEY, process.env.CLOUDRU_API_KEY]) {
    const trimmed = secret?.trim();
    if (trimmed && trimmed.length >= 8) clean = clean.replaceAll(trimmed, "[key]");
  }
  clean = clean.replace(/\s+/g, " ").trim().slice(0, 160);
  return clean || undefined;
}

async function readProviderError(response: Response): Promise<LiteErrorDetail> {
  const text = await response.text();
  try {
    const data = JSON.parse(text) as { error?: { type?: unknown; code?: unknown; message?: unknown } };
    const error = data.error ?? {};
    return {
      type: providerText(error.type),
      code: providerText(error.code),
      message: providerText(error.message),
    };
  } catch {
    return { message: providerText(text) };
  }
}

export type LiteCompletion = {
  raw: string;
  status: number;
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
  thinkingDisabled?: boolean;
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
  return async ({ system, user, timeoutMs }) =>
    completeOpenAIChat({
      endpoint: `${config.baseUrl}/chat/completions`,
      key: process.env.GROQ_API_KEY?.trim(),
      model: config.model,
      system,
      user,
      timeoutMs,
      retryAfterMs: config.retryAfterMs,
      retried: false,
      extra: { reasoning_effort: "low" },
    });
}

export async function completeOpenAIChat(input: {
  endpoint: string;
  key: string | undefined;
  model: string;
  system: string;
  user: string;
  timeoutMs: number;
  retryAfterMs: number;
  retried: boolean;
  extra?: Record<string, unknown>;
}): Promise<LiteCompletion> {
  const key = input.key?.trim();
  if (!key) throw new LiteCallError("unavailable", 0);
  let response: Response;
  try {
    response = await fetch(input.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0,
        stream: false,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "listing_facts",
            strict: true,
            schema: LISTING_FACTS_JSON_SCHEMA,
          },
        },
        ...input.extra,
      }),
      signal: AbortSignal.timeout(input.timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") throw new LiteCallError("timeout", 0);
    throw new LiteCallError("network", 0);
  }
  if (response.status === 429 && !input.retried) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 0;
    if (waitMs <= input.retryAfterMs) {
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      return completeOpenAIChat({ ...input, retried: true });
    }
  }
  const detail = response.ok ? undefined : await readProviderError(response);
  if (response.status === 429) throw new LiteCallError("rate", 429, detail);
  if (response.status === 401) throw new LiteCallError("auth", 401, detail);
  if (response.status === 403) throw new LiteCallError("permission", 403, detail);
  if (response.status === 408) throw new LiteCallError("timeout", 408, detail);
  if (response.status === 404 || response.status === 400) throw new LiteCallError("unavailable", response.status, detail);
  if (response.status >= 500) throw new LiteCallError("server", response.status, detail);
  if (!response.ok) throw new LiteCallError("server", response.status, detail);
  const data = (await response.json()) as {
    choices?: { finish_reason?: string; message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const finishReason = data.choices?.[0]?.finish_reason;
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!raw && finishReason !== "length") throw new LiteCallError("schema", response.status);
  return {
    raw,
    status: response.status,
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
    finishReason,
  };
}

export function extractionRequest(text: string, known?: KnownFacts) {
  return {
    system: EXTRACTION_SYSTEM_PROMPT,
    user: liteUserText(text, known),
  };
}
