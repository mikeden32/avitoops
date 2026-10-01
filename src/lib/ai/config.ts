export type LiteConfig = {
  enabled: boolean;
  shadow: boolean;
  sampleRate: number;
  model: string;
  timeoutMs: number;
  failureThreshold: number;
  cooldownMs: number;
  retryAfterMs: number;
};

function numberFrom(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function liteConfig(env: NodeJS.ProcessEnv = process.env): LiteConfig {
  const enabled = env.AI_LITE_ENABLED === "true" && Boolean(env.GROQ_API_KEY?.trim());
  return {
    enabled,
    shadow: env.AI_LITE_SHADOW_MODE !== "false",
    sampleRate: Math.min(1, numberFrom(env.AI_LITE_SHADOW_SAMPLE_RATE, 1)),
    model: env.GROQ_LITE_MODEL?.trim() || "openai/gpt-oss-20b",
    timeoutMs: numberFrom(env.AI_LITE_TIMEOUT_MS, 3500) || 3500,
    failureThreshold: numberFrom(env.AI_LITE_FAILURE_THRESHOLD, 5) || 5,
    cooldownMs: numberFrom(env.AI_LITE_COOLDOWN_MS, 60_000) || 60_000,
    retryAfterMs: 1000,
  };
}
