import type { LiteConfig } from "./config";
import { completeOpenAIChat, LiteCallError, type LiteClient } from "./groq-lite";

const QWEN36_A3B = "Qwen/Qwen3.6-35B-A3B";

export function getCloudruModelOptions(model: string): Record<string, unknown> {
  if (model !== QWEN36_A3B) return {};
  return { chat_template_kwargs: { enable_thinking: false } };
}

function thinkingDisabled(model: string) {
  const kwargs = getCloudruModelOptions(model).chat_template_kwargs;
  return Boolean(kwargs && typeof kwargs === "object" && !Array.isArray(kwargs) && (kwargs as { enable_thinking?: unknown }).enable_thinking === false);
}

export function cloudruLiteClient(config: LiteConfig): LiteClient {
  return async ({ system, user, timeoutMs }) => {
    const disabled = thinkingDisabled(config.model);
    try {
      const completion = await completeOpenAIChat({
        endpoint: `${config.baseUrl}/chat/completions`,
        key: process.env.CLOUDRU_API_KEY?.trim(),
        model: config.model,
        system,
        user,
        timeoutMs,
        retryAfterMs: config.retryAfterMs,
        retried: false,
        extra: { max_tokens: config.maxOutputTokens, ...getCloudruModelOptions(config.model) },
      });
      return disabled ? { ...completion, thinkingDisabled: true } : completion;
    } catch (error) {
      if (disabled && error instanceof LiteCallError) error.thinkingDisabled = true;
      throw error;
    }
  };
}
