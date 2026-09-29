import { Banner, Field, PageTitle, buttonClass } from "@/components/ui";
import { formatDate, formatDateTime, formatRub, subscriptionStatusLabel } from "@/lib/format";
import { PLANS, planTitle } from "@/lib/plans";
import { loadBilling } from "@/lib/queries/cabinet";
import { AppError } from "@/lib/errors";
import { resumeCheckout, syncPendingPayments } from "@/lib/services/checkout";
import { requireClient } from "@/lib/session";
import { yookassaConfigured } from "@/lib/yookassa";
import { depositRequestAction, payRequestAction, subscriptionRequestAction } from "@/server/cabinet-actions";
import { redirect } from "next/navigation";

const kindText: Record<string, string> = {
  subscription: "Подписка",
  deposit: "Депозит",
  promo_spend: "Продвижение",
  refund: "Возврат",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; pay?: string; check?: string }>;
}) {
  const user = await requireClient();
  const params = await searchParams;
  const yookassaOn = yookassaConfigured();
  let payError: string | null = null;
  if (params.pay === "1" && yookassaOn) {
    try {
      const url = await resumeCheckout(user.id, "subscription");
      if (url) redirect(url);
    } catch (error) {
      if (error instanceof AppError) payError = error.message;
      else throw error;
    }
  }
  const sync = yookassaOn ? await syncPendingPayments(user.id) : { credited: 0, canceled: false };
  const data = await loadBilling(user.id);
  const requestStatus = (status: string) => {
    if (status === "paid") return "оплачено";
    if (status === "rejected") return "отклонено";
    return yookassaOn ? "ждёт оплаты" : "ждёт оператора";
  };
  return (
    <main className="grid gap-4">
      <PageTitle
        title="Биллинг"
        text={
          yookassaOn
            ? "Оплата открывается на странице ЮKassa. Карту мы не видим и не храним. После оплаты тариф или депозит включается сам."
            : "Заявка уходит оператору, он отмечает оплату."
        }
      />
      <Banner message={payError ?? params.error} />
      {sync.credited > 0 ? <p className="text-sm text-good">Оплата зачислена.</p> : null}
      {params.check === "1" && sync.credited === 0 && sync.canceled ? (
        <p className="text-sm text-warn">Оплата не завершена. Можно оплатить заявку снова.</p>
      ) : null}
      {params.ok ? (
        <p className="text-sm text-good">
          {yookassaOn ? "Заявка создана. Если страница оплаты не открылась, нажмите «Оплатить»." : "Заявка создана и ждёт подтверждения."}
        </p>
      ) : null}
      <section className="rounded-2xl border border-line bg-card p-4">
        <p>Тариф: {data.plan ? planTitle(data.plan) : "не оплачен"}</p>
        <p>
          Статус:{" "}
          {data.trial && data.status === "active"
            ? "пробный день"
            : data.status
              ? subscriptionStatusLabel(data.status)
              : "нет"}
        </p>
        <p>
          {data.trial && data.status === "active"
            ? `Пробный день тарифа Сеть до ${formatDateTime(data.periodEnd)}. Выбранный тариф включится после оплаты.`
            : `Следующий период до: ${formatDate(data.periodEnd)}`}
        </p>
        <p>Депозит: {formatRub(data.depositRub)}</p>
      </section>
      <div className="grid items-start gap-4 lg:grid-cols-2">
      <form action={subscriptionRequestAction} className="grid gap-3 rounded-2xl border border-line bg-card p-4">
        <Field label={yookassaOn ? "Оплатить тариф" : "Заявка на подписку"}>
          <select name="plan" defaultValue={data.plan ?? "start"}>
            {Object.values(PLANS).map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.title} — {formatRub(plan.priceRub)}
              </option>
            ))}
          </select>
        </Field>
        <button className={buttonClass()}>{yookassaOn ? "Оплатить" : "Запросить оплату"}</button>
      </form>
      <form action={depositRequestAction} className="grid gap-3 rounded-2xl border border-line bg-card p-4">
        <Field label="Пополнить депозит, ₽">
          <input name="amount" type="number" min={100} step={1} required />
        </Field>
        <button className={buttonClass("ghost")}>{yookassaOn ? "Пополнить" : "Запросить пополнение"}</button>
      </form>
      </div>
      <section className="grid gap-2">
        <h2 className="font-semibold">Заявки</h2>
        <ul className="grid gap-2 text-sm">
          {data.requests.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card px-3 py-2">
              <span>
                {kindText[item.kind] ?? item.kind} {item.plan ? `· ${planTitle(item.plan)}` : ""} · {formatRub(item.amountRub)} ·{" "}
                {requestStatus(item.status)} · {formatDateTime(item.createdAt)}
              </span>
              {yookassaOn && item.status === "pending" ? (
                <form action={payRequestAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className={buttonClass()}>Оплатить</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <section className="grid gap-2">
        <h2 className="font-semibold">История</h2>
        <ul className="grid gap-2 text-sm">
          {data.ledger.map((item) => (
            <li key={item.id} className="rounded-xl border border-line bg-card px-3 py-2">
              {kindText[item.kind] ?? item.kind} · {formatRub(item.amountRub)} · {formatDateTime(item.createdAt)}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
