import { PublicHeader } from "@/components/public-header";
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
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6">
        <CabinetNav />
        {dash.access !== "green" ? (
          <p className="rounded-xl border border-warn/40 bg-card px-3 py-2 text-sm text-warn">
            {accessLabel(dash.access)}. Новые публикации, правки и ответы не стартуют.
          </p>
        ) : null}
        {!dash.hasProfile ? (
          <p className="rounded-xl border border-line bg-card px-3 py-2 text-sm">
            Заполните онбординг, чтобы загрузить объявления. <a href="/app/onboarding">Открыть</a>
          </p>
        ) : null}
        {children}
      </div>
    </>
  );
}
