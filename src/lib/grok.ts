export type GrokErrorType =
  | "auth"
  | "permission"
  | "region"
  | "model_not_found"
  | "bad_request"
  | "schema_invalid"
  | "rate_limit"
  | "server_error"
  | "network"
  | "timeout"
  | "unknown";

export type GrokFailure = {
  providerStatus: number | null;
  providerErrorType: GrokErrorType;
  providerErrorCode: string | null;
  providerRequestId: string | null;
  providerMessageClass: string | null;
};

export class GrokCallError extends Error implements GrokFailure {
  readonly providerStatus: number | null;
  readonly providerErrorType: GrokErrorType;
  readonly providerErrorCode: string | null;
  readonly providerRequestId: string | null;
  readonly providerMessageClass: string | null;

  constructor(failure: GrokFailure) {
    super("grok");
    this.name = "GrokCallError";
    this.providerStatus = failure.providerStatus;
    this.providerErrorType = failure.providerErrorType;
    this.providerErrorCode = failure.providerErrorCode;
    this.providerRequestId = failure.providerRequestId;
    this.providerMessageClass = failure.providerMessageClass;
  }
}

export function seniorModelId(env: NodeJS.ProcessEnv = process.env) {
  const id = env.XAI_MODEL?.trim();
  return id || "grok-4.6";
}

function shortCode(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!text || text.length > 80 || /bearer|sk-|xai-/i.test(text)) return null;
  return text;
}

export function classifyGrokHttp(status: number, requestId: string | null, body: string): GrokFailure {
  if (/not available in your region/i.test(body)) {
    return {
      providerStatus: status,
      providerErrorType: "region",
      providerErrorCode: null,
      providerRequestId: requestId,
      providerMessageClass: "region_unavailable",
    };
  }
  let payload: { error?: unknown; code?: unknown } | null = null;
  try {
    payload = JSON.parse(body) as { error?: unknown; code?: unknown };
  } catch {
    payload = null;
  }
  const error = payload && typeof payload.error === "object" && payload.error ? payload.error as { message?: unknown; type?: unknown; code?: unknown } : null;
  const message = typeof payload?.error === "string" ? payload.error : typeof error?.message === "string" ? error.message : "";
  const text = message.toLowerCase();
  let providerErrorType: GrokErrorType = "unknown";
  if (status === 401 || /incorrect api key|invalid api key|authentication/.test(text)) providerErrorType = "auth";
  else if (status === 403 || /permission|forbidden/.test(text)) providerErrorType = "permission";
  else if (status === 404 || /model.+not found|unknown model|does not exist/.test(text)) providerErrorType = "model_not_found";
  else if (status === 429 || /rate limit/.test(text)) providerErrorType = "rate_limit";
  else if (status === 400 && /schema|response_format|json_schema/.test(text)) providerErrorType = "schema_invalid";
  else if (status === 400 || /model.+not found|unknown model/.test(text)) providerErrorType = /model.+not found|unknown model/.test(text) ? "model_not_found" : "bad_request";
  else if (status >= 500) providerErrorType = "server_error";
  else if (/<html/i.test(body)) providerErrorType = "permission";
  const providerMessageClass = shortCode(error?.type) ?? (providerErrorType === "permission" && /<html/i.test(body) ? "html_block" : null);
  return {
    providerStatus: status,
    providerErrorType,
    providerErrorCode: shortCode(error?.code ?? payload?.code),
    providerRequestId: requestId,
    providerMessageClass,
  };
}

export async function askGrok(system: string, user: string) {
  const key = process.env.XAI_API_KEY;
  if (!key) return null;
  const model = seniorModelId();
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 2000);
    const requestId = response.headers.get("x-request-id") || response.headers.get("x-xai-request-id");
    throw new GrokCallError(classifyGrokHttp(response.status, requestId, body));
  }
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim();
  return text ? text.slice(0, 1500) : null;
}

export async function speakGrok(text: string): Promise<Uint8Array | null> {
  const key = process.env.XAI_API_KEY;
  if (!key) return null;
  const spoken = text.replaceAll("₽", " рублей ").replace(/\s+/g, " ").trim().slice(0, 700);
  if (!spoken) return null;
  try {
    const response = await fetch("https://api.x.ai/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: spoken,
        voice_id: process.env.XAI_VOICE?.trim() || "ara",
        language: "ru",
        text_normalization: true,
        speed: 1,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("json")) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > 80 ? bytes : null;
  } catch {
    return null;
  }
}
