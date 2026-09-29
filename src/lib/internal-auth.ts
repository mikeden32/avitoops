import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function authorizeInternal(req: Request) {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  return safeEqual(header, `Bearer ${expected}`);
}
