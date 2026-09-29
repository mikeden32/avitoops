import { Banner, Field, PageTitle, buttonClass } from "@/components/ui";
import { formatRub } from "@/lib/format";
import { loadPromo } from "@/lib/queries/cabinet";
import { requireClient } from "@/lib/session";
import { promoJobAction, promoSettingsAction } from "@/server/cabinet-actions";

export default async function PromoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const user = await requireClient();
  const data = await loadPromo(user.id);
  const params = await searchParams;
  return (
    <main className="grid gap-4">
      <PageTitle title="Продвижение" text="Реклама списывается с депозита и не выходит за недельный лимит." />
      <Banner message={params.error} />
      {params.ok ? <p className="text-sm text-good">Сохранено</p> : null}
      <p className="text-sm">
        Расход за неделю: {formatRub(data.spentRub)} из {formatRub(data.weekLimitRub)}. Депозит:{" "}
        {formatRub(data.depositRub)}.
      </p>
      <div className="grid items-start gap-4 lg:grid-cols-2">
      <form action={promoSettingsAction} className="grid gap-3 rounded-2xl border border-line bg-card p-4">
        <label className="flex items-center gap-2 text-sm">
          <input name="enabled" type="checkbox" className="w-auto" defaultChecked={data.enabled} />
          Включено
        </label>
        <Field label="Лимит ₽/нед">
          <input name="weekLimit" type="number" min={0} defaultValue={data.weekLimitRub} required />
        </Field>
        <button className={buttonClass()}>Сохранить лимит</button>
      </form>
      <form action={promoJobAction} className="grid gap-3 rounded-2xl border border-line bg-card p-4">
        <Field label="Объявление">
          <select name="listingId" required>
            {data.live.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Сумма теста, ₽">
          <input name="maxRub" type="number" min={1} required />
        </Field>
        <button className={buttonClass()} disabled={data.live.length === 0}>
          Запустить продвижение
        </button>
        {data.live.length === 0 ? <p className="text-sm text-muted">Нужно хотя бы одно опубликованное объявление.</p> : null}
      </form>
      </div>
      <p className="text-sm">
        <a href="/app/billing">Пополнить депозит</a>
      </p>
    </main>
  );
}
