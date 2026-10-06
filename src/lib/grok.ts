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

export type SeniorTransportKind = "opsi" | "xai" | "unavailable" | "invalid";

function envValue(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name];
  return typeof value === "string" ? value.trim() : "";
}

export function resolveSeniorTransport(env: NodeJS.ProcessEnv = process.env): SeniorTransportKind {
  const baseUrl = envValue(env, "OPSI_BASE_URL");
  const token = envValue(env, "OPSI_SERVICE_TOKEN");
  if (baseUrl && token) return "opsi";
  if (baseUrl || token) return "invalid";
  if (envValue(env, "XAI_API_KEY")) return "xai";
  return "unavailable";
}

export function seniorConfigured(env: NodeJS.ProcessEnv = process.env) {
  const kind = resolveSeniorTransport(env);
  return kind === "opsi" || kind === "xai";
}

export function seniorTransportName(env: NodeJS.ProcessEnv = process.env) {
  const kind = resolveSeniorTransport(env);
  return kind === "opsi" || kind === "xai" ? kind : null;
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

const SENIOR_TIMEOUT_MS = 20000;

function throwTransportFailure(error: unknown): never {
  const name = error instanceof Error ? error.name : "";
  const timedOut = name === "TimeoutError" || name === "AbortError";
  throw new GrokCallError({
    providerStatus: null,
    providerErrorType: timedOut ? "timeout" : "network",
    providerErrorCode: null,
    providerRequestId: null,
    providerMessageClass: timedOut ? "timeout" : "network",
  });
}

function classifyOpsiHttp(status: number, requestId: string | null, body: string): GrokFailure {
  let payload: { requestId?: unknown; error?: unknown } | null = null;
  try {
    payload = JSON.parse(body) as { requestId?: unknown; error?: unknown };
  } catch {
    payload = null;
  }
  const error = payload && typeof payload.error === "object" && payload.error ? payload.error as { type?: unknown; code?: unknown } : null;
  const hint = `${typeof error?.type === "string" ? error.type : ""} ${typeof error?.code === "string" ? error.code : ""}`.toLowerCase();
  let providerErrorType: GrokErrorType = "unknown";
  if (status === 401) providerErrorType = "auth";
  else if (status === 403) providerErrorType = "permission";
  else if (status === 429) providerErrorType = "rate_limit";
  else if (status === 400 && /schema|response_format|json_schema/.test(hint)) providerErrorType = "schema_invalid";
  else if (status === 400) providerErrorType = "bad_request";
  else if (status >= 500) providerErrorType = "server_error";
  else if (/unauthor|invalid.?token|authentication/.test(hint)) providerErrorType = "auth";
  else if (/forbidden|permission/.test(hint)) providerErrorType = "permission";
  else if (/rate/.test(hint)) providerErrorType = "rate_limit";
  else if (/schema|json_schema|response_format/.test(hint)) providerErrorType = "schema_invalid";
  const bodyRequestId = typeof payload?.requestId === "string" ? shortCode(payload.requestId) : null;
  return {
    providerStatus: status || null,
    providerErrorType,
    providerErrorCode: shortCode(error?.code),
    providerRequestId: requestId || bodyRequestId,
    providerMessageClass: shortCode(error?.type),
  };
}

async function readFailure(response: Response, classify: (status: number, requestId: string | null, body: string) => GrokFailure) {
  const body = (await response.text()).slice(0, 2000);
  const requestId = response.headers.get("x-request-id") || response.headers.get("x-xai-request-id");
  throw new GrokCallError(classify(response.status, requestId, body));
}

async function askOpsi(system: string, user: string) {
  const baseUrl = envValue(process.env, "OPSI_BASE_URL").replace(/\/+$/, "");
  const token = envValue(process.env, "OPSI_SERVICE_TOKEN");
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/senior`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agent: "avito-specialist",
        task: "senior_completion",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        context: {},
      }),
      signal: AbortSignal.timeout(SENIOR_TIMEOUT_MS),
    });
  } catch (error) {
    throwTransportFailure(error);
  }
  if (!response.ok) await readFailure(response, classifyOpsiHttp);
  const data = (await response.json()) as { ok?: unknown; content?: unknown; requestId?: unknown; error?: unknown };
  if (data.ok !== true) {
    throw new GrokCallError(classifyOpsiHttp(response.status, shortCode(data.requestId), JSON.stringify({ error: data.error, requestId: data.requestId })));
  }
  const text = typeof data.content === "string" ? data.content.trim() : "";
  return text ? text.slice(0, 1500) : null;
}

async function askXai(system: string, user: string) {
  const key = envValue(process.env, "XAI_API_KEY");
  const model = seniorModelId();
  let response: Response;
  try {
    response = await fetch("https://api.x.ai/v1/chat/completions", {
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
      signal: AbortSignal.timeout(SENIOR_TIMEOUT_MS),
    });
  } catch (error) {
    throwTransportFailure(error);
  }
  if (!response.ok) await readFailure(response, classifyGrokHttp);
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim();
  return text ? text.slice(0, 1500) : null;
}

export async function askGrok(system: string, user: string) {
  const kind = resolveSeniorTransport();
  if (kind === "unavailable") return null;
  if (kind === "invalid") {
    throw new GrokCallError({
      providerStatus: null,
      providerErrorType: "unknown",
      providerErrorCode: "opsi_config",
      providerRequestId: null,
      providerMessageClass: "opsi_misconfigured",
    });
  }
  if (kind === "opsi") return askOpsi(system, user);
  return askXai(system, user);
}

export async function speakGrok(text: string): Promise<Uint8Array | null> {
  const kind = resolveSeniorTransport();
  if (kind === "opsi" || kind === "invalid") return null;
  const key = envValue(process.env, "XAI_API_KEY");
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
