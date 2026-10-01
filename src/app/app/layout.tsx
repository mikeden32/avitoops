import { PublicHeader } from "@/components/public-header";
import { CabinetLinks } from "@/components/desk-board";
import { CabinetNav } from "@/components/cabinet-nav";
import { requireClient } from "@/lib/session";
import { loadDashboard } from "@/lib/queries/cabinet";
import { accessLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CabinetLayout({ children }: { children: React.ReactNode }) {
  const user = await requireClient();
  const dash = await loadDashboard(user.id);
  return (
    <>
      <PublicHeader />
      <div className="shell grid gap-6 py-6">
        <CabinetNav />
        {dash.access !== "green" ? (
          <p className="rounded-xl border border-warn/40 bg-card px-3 py-2 text-sm text-warn">
            {accessLabel(dash.access)}. Новые публикации, правки и ответы не стартуют.
          </p>
        ) : null}
        {dash.consented && !dash.avitoConnected ? (
          <p className="rounded-xl border border-line bg-card px-3 py-2 text-sm">
            Пароль не нужен. Откроется страница Авито.{" "}
            <a className="font-semibold underline" href="/api/avito/connect">
              Перейти в Авито
            </a>
          </p>
        ) : null}
        {children}
        <CabinetLinks />
      </div>
    </>
  );
}
