import { Banner, PageTitle, buttonClass } from "@/components/ui";
import { formatDateTime, formatRub } from "@/lib/format";
import { planTitle } from "@/lib/plans";
import { loadPayments } from "@/lib/queries/admin";
import { yookassaConfigured } from "@/lib/yookassa";
import { confirmPaymentAction, rejectPaymentAction } from "@/server/admin-actions";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const params = await searchParams;
  const rows = await loadPayments();
  return (
    <main className="grid gap-4">
      <PageTitle
        title="Оплаты"
        text={
          yookassaConfigured()
            ? "ЮKassa зачисляет оплату сама. «Оплачено» — запасной путь, если деньги уже пришли, а заявка зависла."
            : "Оплату отмечает оператор."
        }
      />
      <Banner message={params.error} />
      {params.ok ? <p className="text-sm text-good">Оплата зачислена.</p> : null}
      <ul className="grid gap-3">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card p-4 text-sm">
            <div>
              <p className="font-medium">{row.email}</p>
              <p>
                {row.kind} {row.plan ? `· ${planTitle(row.plan)}` : ""} · {formatRub(row.amountRub)} · {row.status}
              </p>
              <p className="text-muted">{formatDateTime(row.createdAt)}</p>
            </div>
            {row.status === "pending" ? (
              <div className="flex gap-2">
                <form action={confirmPaymentAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <button className={buttonClass()}>Оплачено</button>
                </form>
                <form action={rejectPaymentAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <button className={buttonClass("ghost")}>Отклонить</button>
                </form>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
