import { createHmac, timingSafeEqual } from "node:crypto";

const tokenUrl = "https://api.avito.ru/token";

export function avitoAppConfigured() {
  return Boolean(process.env.AVITO_CLIENT_ID && process.env.AVITO_CLIENT_SECRET);
}

export function avitoRedirectUri() {
  return process.env.AVITO_REDIRECT_URI || "http://localhost:3000/api/avito/callback";
}

export function avitoState(userId: string) {
  const secret = process.env.AUTH_SECRET || "";
  const sig = createHmac("sha256", secret).update(userId).digest("hex");
  return `${userId}.${sig}`;
}

export function userIdFromAvitoState(state: string) {
  const dot = state.lastIndexOf(".");
  if (dot < 0) return null;
  const userId = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = createHmac("sha256", process.env.AUTH_SECRET || "")
    .update(userId)
    .digest("hex");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return userId;
}

export function avitoAuthorizeUrl(userId: string) {
  const url = new URL("https://avito.ru/oauth");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.AVITO_CLIENT_ID || "");
  url.searchParams.set(
    "scope",
    "messenger:read messenger:write items:info items:apply_vas user:read",
  );
  url.searchParams.set("redirect_uri", avitoRedirectUri());
  url.searchParams.set("state", avitoState(userId));
  return url.toString();
}

type TokenPack = { accessToken: string; refreshToken: string | null };

async function readToken(body: URLSearchParams): Promise<TokenPack> {
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("avito_token");
  const data = (await response.json()) as { access_token?: string; refresh_token?: string };
  if (!data.access_token) throw new Error("avito_token");
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? null };
}

export function exchangeAvitoCode(code: string) {
  return readToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: process.env.AVITO_CLIENT_ID || "",
      client_secret: process.env.AVITO_CLIENT_SECRET || "",
      redirect_uri: avitoRedirectUri(),
    }),
  );
}

export function refreshAvitoToken(refreshToken: string) {
  return readToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.AVITO_CLIENT_ID || "",
      client_secret: process.env.AVITO_CLIENT_SECRET || "",
    }),
  );
}

export async function avitoSelfId(accessToken: string) {
  const response = await fetch("https://api.avito.ru/core/v1/accounts/self", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { id?: number | string };
  return data.id == null ? null : String(data.id);
}

type Incoming = { chatId: string; messageId: string; text: string };

export async function incomingAvitoMessages(accessToken: string, avitoUserId: string) {
  const response = await fetch(
    `https://api.avito.ru/messenger/v2/accounts/${encodeURIComponent(avitoUserId)}/chats?limit=20`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok) throw new Error("avito_chats");
  const data = (await response.json()) as { chats?: Record<string, unknown>[] };
  const found: Incoming[] = [];
  for (const chat of data.chats ?? []) {
    const chatId = String(chat.id ?? "");
    const last = (chat.last_message ?? chat.lastMessage) as Record<string, unknown> | undefined;
    if (!chatId || !last) continue;
    const direction = String(last.direction ?? "");
    if (direction === "out") continue;
    const content = last.content as { text?: string } | undefined;
    const text = String(content?.text ?? last.text ?? "").trim();
    const messageId = String(last.id ?? "");
    if (!text || !messageId) continue;
    found.push({ chatId, messageId, text: text.slice(0, 500) });
  }
  return found;
}

export async function sendAvitoMessage(
  accessToken: string,
  avitoUserId: string,
  chatId: string,
  text: string,
) {
  const response = await fetch(
    `https://api.avito.ru/messenger/v1/accounts/${encodeURIComponent(avitoUserId)}/chats/${encodeURIComponent(chatId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "text", message: { text: text.slice(0, 1000) } }),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok) throw new Error("avito_send");
}
