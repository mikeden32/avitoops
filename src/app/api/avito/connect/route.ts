import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { avitoAppConfigured, avitoAuthorizeUrl } from "@/lib/avito";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "client") redirect("/login");
  if (!avitoAppConfigured()) {
    redirect("/app?error=" + encodeURIComponent("Страница Авито откроется, когда подключение будет готово. Пароль вводить не нужно."));
  }
  redirect(avitoAuthorizeUrl(session.user.id));
}
