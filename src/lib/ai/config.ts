export type LiteProviderId = "cloudru" | "groq";

export type LiteConfig = {
  enabled: boolean;
  shadow: boolean;
  sampleRate: number;
  provider: LiteProviderId;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  failureThreshold: number;
  cooldownMs: number;
  retryAfterMs: number;
  maxOutputTokens: number;
};

export const CLOUDRU_LITE_BASE_URL = "https://foundation-models.api.cloud.ru/v1";
export const CLOUDRU_LITE_MODEL = "ai-sage/GigaChat3.5-432B-A28B";

function numberFrom(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function liteMaxOutputTokens(env: NodeJS.ProcessEnv = process.env) {
  const value = Number(env.AI_LITE_MAX_OUTPUT_TOKENS);
  if (!Number.isInteger(value) || value < 64 || value > 2400) return 800;
  return value;
}

export function liteConfig(env: NodeJS.ProcessEnv = process.env): LiteConfig {
  const provider: LiteProviderId = env.AI_LITE_PROVIDER?.trim() === "groq" ? "groq" : "cloudru";
  const key = provider === "groq" ? env.GROQ_API_KEY : env.CLOUDRU_API_KEY;
  const enabled = env.AI_LITE_ENABLED !== "false" && Boolean(key?.trim());
  const baseUrl = (provider === "groq" ? "https://api.groq.com/openai/v1" : env.CLOUDRU_BASE_URL?.trim() || CLOUDRU_LITE_BASE_URL).replace(/\/$/, "");
  const model = provider === "groq" ? env.GROQ_LITE_MODEL?.trim() || "openai/gpt-oss-20b" : env.CLOUDRU_LITE_MODEL?.trim() || CLOUDRU_LITE_MODEL;
  return {
    enabled,
    shadow: env.AI_LITE_SHADOW_MODE !== "false",
    sampleRate: Math.min(1, numberFrom(env.AI_LITE_SHADOW_SAMPLE_RATE, 1)),
    provider,
    model,
    baseUrl,
    timeoutMs: numberFrom(env.AI_LITE_TIMEOUT_MS, 3500) || 3500,
    failureThreshold: numberFrom(env.AI_LITE_FAILURE_THRESHOLD, 5) || 5,
    cooldownMs: numberFrom(env.AI_LITE_COOLDOWN_MS, 60_000) || 60_000,
    retryAfterMs: 1000,
    maxOutputTokens: liteMaxOutputTokens(env),
  };
}
