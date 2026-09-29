import { AppError } from "./errors";

const API = "https://api.yookassa.ru/v3";

export type YooPayment = {
  id: string;
  status: string;
  paid: boolean;
  amount: { value: string; currency: string };
  confirmationUrl: string | null;
  requestId: string | null;
};

export class YooKassaError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "YooKassaError";
  }
}

export function yookassaConfigured() {
  return Boolean(process.env.YOOKASSA_SHOP_ID?.trim() && process.env.YOOKASSA_SECRET_KEY?.trim());
}

export function siteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.AUTH_URL || "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

export function allowedCheckoutUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)((yookassa|yoomoney)\.ru)$/.test(url.hostname);
  } catch {
    return false;
  }
}

export function sameAmount(value: string, rub: number) {
  const cents = Math.round(Number(value) * 100);
  return Number.isFinite(cents) && cents === rub * 100;
}

function authHeader() {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim() ?? "";
  const secret = process.env.YOOKASSA_SECRET_KEY?.trim() ?? "";
  return `Basic ${Buffer.from(`${shopId}:${secret}`).toString("base64")}`;
}

function vatCode() {
  const parsed = Number(process.env.YOOKASSA_VAT_CODE ?? "1");
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) return 1;
  return parsed;
}

async function failureMessage(response: Response) {
  if (response.status === 401 || response.status === 403) {
    return "ЮKassa не приняла ключи магазина. Проверьте их в .env и перезапустите сайт.";
  }
  try {
    const body = (await response.json()) as { description?: unknown };
    if (
      typeof body.description === "string" &&
      body.description.length > 0 &&
      body.description.length < 180 &&
      !/secret|key|shop/i.test(body.description)
    ) {
      return body.description;
    }
  } catch {
    /* empty or non-json body */
  }
  if (response.status >= 500) return "ЮKassa временно недоступна";
  return "ЮKassa не приняла платёж";
}

async function yooFetch(path: string, init?: { method?: string; body?: string; idempotenceKey?: string }) {
  if (!yookassaConfigured()) throw new AppError("ЮKassa не настроена");
  const headers: Record<string, string> = {
    Authorization: authHeader(),
    Accept: "application/json",
  };
  if (init?.body) headers["Content-Type"] = "application/json";
  if (init?.idempotenceKey) headers["Idempotence-Key"] = init.idempotenceKey.slice(0, 64);
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers,
      body: init?.body,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new YooKassaError("ЮKassa временно недоступна", 503);
  }
  if (!response.ok) throw new YooKassaError(await failureMessage(response), response.status);
  return response.json() as Promise<unknown>;
}

function parsePayment(body: unknown): YooPayment {
  if (!body || typeof body !== "object") throw new AppError("ЮKassa вернула пустой ответ");
  const row = body as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  const status = typeof row.status === "string" ? row.status : "";
  const paid = row.paid === true;
  const amount = row.amount && typeof row.amount === "object" ? (row.amount as Record<string, unknown>) : {};
  const value = typeof amount.value === "string" ? amount.value : "";
  const currency = typeof amount.currency === "string" ? amount.currency : "";
  const confirmation =
    row.confirmation && typeof row.confirmation === "object"
      ? (row.confirmation as Record<string, unknown>)
      : {};
  const confirmationUrl = typeof confirmation.confirmation_url === "string" ? confirmation.confirmation_url : null;
  const metadata = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
  const requestId = typeof metadata.requestId === "string" ? metadata.requestId : null;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !status || !value) throw new AppError("ЮKassa вернула непонятный ответ");
  return { id, status, paid, amount: { value, currency }, confirmationUrl, requestId };
}

export async function getYooKassaPayment(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("Некорректный платёж ЮKassa");
  return parsePayment(await yooFetch(`/payments/${id}`));
}

export async function createYooKassaPayment(input: {
  amountRub: number;
  description: string;
  returnUrl: string;
  requestId: string;
  email: string;
  idempotenceKey: string;
}) {
  const value = `${input.amountRub.toFixed(2)}`;
  const description = input.description.slice(0, 128);
  const payload: Record<string, unknown> = {
    amount: { value, currency: "RUB" },
    capture: true,
    confirmation: { type: "redirect", return_url: input.returnUrl },
    description,
    metadata: { requestId: input.requestId },
  };
  if (process.env.YOOKASSA_RECEIPT !== "0" && input.email) {
    payload.receipt = {
      customer: { email: input.email },
      items: [
        {
          description,
          quantity: "1.00",
          amount: { value, currency: "RUB" },
          vat_code: vatCode(),
          payment_mode: "full_payment",
          payment_subject: "service",
        },
      ],
    };
  }
  const payment = parsePayment(
    await yooFetch("/payments", {
      method: "POST",
      body: JSON.stringify(payload),
      idempotenceKey: input.idempotenceKey,
    }),
  );
  if (payment.confirmationUrl && !allowedCheckoutUrl(payment.confirmationUrl)) {
    throw new AppError("ЮKassa вернула неожиданный адрес оплаты");
  }
  return payment;
}

export function paymentIdFromNotice(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const row = body as Record<string, unknown>;
  const event = typeof row.event === "string" ? row.event : "";
  if (event !== "payment.succeeded" && event !== "payment.canceled") return null;
  const object = row.object;
  if (!object || typeof object !== "object") return null;
  const id = (object as Record<string, unknown>).id;
  return typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}
