import type { LiteConfig } from "./config";
import { completeOpenAIChat, type LiteClient } from "./groq-lite";

export function cloudruLiteClient(config: LiteConfig): LiteClient {
  return async ({ system, user, timeoutMs }) =>
    completeOpenAIChat({
      endpoint: `${config.baseUrl}/chat/completions`,
      key: process.env.CLOUDRU_API_KEY?.trim(),
      model: config.model,
      system,
      user,
      timeoutMs,
      retryAfterMs: config.retryAfterMs,
      retried: false,
      // A price edit once filled this cap with prose. Unambiguous edits no longer call the model.
      extra: { max_tokens: 800 },
    });
}
