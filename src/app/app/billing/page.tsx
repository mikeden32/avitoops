import { Banner, Field, PageTitle, buttonClass } from "@/components/ui";
import { formatDate, formatDateTime, formatRub, subscriptionStatusLabel } from "@/lib/format";
import { loadBilling } from "@/lib/queries/cabinet";
import { requireClient } from "@/lib/session";
import { depositRequestAction, subscriptionRequestAction } from "@/server/cabinet-actions";

const kindText: Record<string, string> = {
  subscription: "Подписка",
  deposit: "Депозит",
  promo_spend: "Продвижение",
  refund: "Возврат",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const user = await requireClient();
  const data = await loadBilling(user.id);
  const params = await searchParams;
  return (
    <main className="grid gap-4">
      <PageTitle
        title="Биллинг"
        text="Оплата на пилоте подтверждается оператором. Платёжный провайдер подключим отдельно."
      />
      <Banner message={params.error} />
      {params.ok ? <p className="text-sm text-good">Заявка создана и ждёт подтверждения.</p> : null}
      <section className="rounded-2xl border border-line bg-card p-4">
        <p>Тариф: {data.plan === "business" ? "Бизнес" : data.plan === "start" ? "Старт" : "не оплачен"}</p>
        <p>Статус: {data.status ? subscriptionStatusLabel(data.status) : "нет"}</p>
        <p>Следующий период до: {formatDate(data.periodEnd)}</p>
        <p>Депозит: {formatRub(data.depositRub)}</p>
      </section>
      <form action={subscriptionRequestAction} className="grid gap-3 rounded-2xl border border-line bg-card p-4">
        <Field label="Заявка на подписку">
          <select name="plan" defaultValue={data.plan ?? "start"}>
            <option value="start">Старт — 4 900 ₽</option>
            <option value="business">Бизнес — 9 900 ₽</option>
          </select>
        </Field>
        <button className={buttonClass()}>Запросить оплату</button>
      </form>
      <form action={depositRequestAction} className="grid gap-3 rounded-2xl border border-line bg-card p-4">
        <Field label="Пополнить депозит, ₽">
          <input name="amount" type="number" min={100} step={1} required />
        </Field>
        <button className={buttonClass("ghost")}>Запросить пополнение</button>
      </form>
      <section className="grid gap-2">
        <h2 className="font-semibold">Заявки</h2>
        <ul className="grid gap-2 text-sm">
          {data.requests.map((item) => (
            <li key={item.id} className="rounded-xl border border-line bg-card px-3 py-2">
              {kindText[item.kind] ?? item.kind} {item.plan ? `· ${item.plan}` : ""} · {formatRub(item.amountRub)} ·{" "}
              {item.status} · {formatDateTime(item.createdAt)}
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
