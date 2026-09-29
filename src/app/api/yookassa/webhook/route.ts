import { creditYooKassaPayment } from "@/lib/services/checkout";
import { AppError } from "@/lib/errors";
import { YooKassaError, getYooKassaPayment, paymentIdFromNotice, yookassaConfigured } from "@/lib/yookassa";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!yookassaConfigured()) return new Response("unavailable", { status: 503 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const id = paymentIdFromNotice(body);
  if (!id) return new Response("ok");
  try {
    const payment = await getYooKassaPayment(id);
    await creditYooKassaPayment(payment);
  } catch (error) {
    if (error instanceof AppError) return new Response("ok");
    if (error instanceof YooKassaError && error.status < 500) return new Response("ok");
    return new Response("retry", { status: 500 });
  }
  return new Response("ok");
}
