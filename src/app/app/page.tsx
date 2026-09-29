import Link from "next/link";
import { Card, PageTitle, buttonClass } from "@/components/ui";
import { accessLabel, formatDate, formatRub, subscriptionStatusLabel } from "@/lib/format";
import { PLAN_LIMITS } from "@/lib/plans";
import { loadDashboard } from "@/lib/queries/cabinet";
import { requireClient } from "@/lib/session";

export default async function DashboardPage() {
  const user = await requireClient();
  const data = await loadDashboard(user.id);
  const limit = data.plan ? PLAN_LIMITS[data.plan] : 0;
  return (
    <main className="grid gap-4">
      <PageTitle title="Кабинет" text="Статус ведения, объявления и депозит на рекламу." />
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <p className="text-sm text-muted">Доступ</p>
          <p className="text-xl font-semibold">{accessLabel(data.access)}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Объявления</p>
          <p className="text-xl font-semibold">
            {data.listingCount}
            {limit ? ` / ${limit}` : ""}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Новые лиды</p>
          <p className="text-xl font-semibold">{data.newLeads}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Депозит</p>
          <p className="text-xl font-semibold">{formatRub(data.depositRub)}</p>
        </Card>
      </div>
      <Card>
        <p>
          Тариф: {data.plan === "business" ? "Бизнес" : data.plan === "start" ? "Старт" : "не выбран"} ·{" "}
          {data.subscriptionStatus ? subscriptionStatusLabel(data.subscriptionStatus) : "нет оплаты"}
        </p>
        <p className="text-sm text-muted">Следующее окончание периода: {formatDate(data.periodEnd)}</p>
        {data.block ? <p className="mt-2 text-sm text-warn">{data.block}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className={buttonClass()} href="/app/listings/new">
            Новое объявление
          </Link>
          <Link className={buttonClass("ghost")} href="/app/billing">
            Биллинг
          </Link>
        </div>
      </Card>
    </main>
  );
}
