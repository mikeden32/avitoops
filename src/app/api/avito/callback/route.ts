import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { avitoSelfId, exchangeAvitoCode, userIdFromAvitoState } from "@/lib/avito";
import { db } from "@/lib/db";
import { avitoAccounts } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const userId = userIdFromAvitoState(url.searchParams.get("state") || "");
  if (!code || !userId) redirect("/app/settings?error=Авито+не+подтвердил+доступ");
  try {
    const token = await exchangeAvitoCode(code);
    if (!token.refreshToken) redirect("/app/settings?error=Авито+не+вернул+долгосрочный+доступ");
    const avitoUserId = await avitoSelfId(token.accessToken);
    await db
      .update(avitoAccounts)
      .set({
        status: "connected",
        refreshToken: token.refreshToken,
        avitoUserId,
      })
      .where(eq(avitoAccounts.userId, userId));
  } catch {
    redirect("/app/settings?error=Не+удалось+подключить+Авито");
  }
  redirect("/app?avito=1");
}
