import Link from "next/link";
import { buttonClass } from "@/components/ui";
import { formatRub } from "@/lib/format";
import { DAILY_QUOTA, PLANS, agentFillsProfile } from "@/lib/plans";

const rows = [
  ["publish", "Объявления в день", "объявление", "объявления", "объявлений"],
  ["update", "Правки в день", "правка", "правки", "правок"],
  ["promo", "Продвижения в день", "продвижение", "продвижения", "продвижений"],
  ["replies", "Ответы в день", "ответ", "ответа", "ответов"],
] as const;

function countLine(value: number, one: string, few: string, many: string) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  const word = mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
  return `${value} ${word} в день`;
}

export function OpsPricing() {
  const plans = Object.values(PLANS);
  return (
    <section id="tariffs" className="hero-shell py-16" aria-labelledby="tariffs-title">
      <div className="grid max-w-3xl gap-3">
        <h2 id="tariffs-title" className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
          Выберите объём работы для OPS
        </h2>
        <p className="text-muted">
          Функции остаются понятными, меняется ежедневный объём работы. Реклама на площадке оплачивается отдельно.
        </p>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const quota = DAILY_QUOTA[plan.id];
          return (
            <article key={plan.id} className="flex flex-col gap-4 rounded-[24px] border border-line bg-card p-5">
              <div>
                <h3 className="text-xl font-extrabold">{plan.title}</h3>
                <p className="mt-1 text-sm text-muted">{plan.hint}</p>
                <p className="mt-3 text-3xl font-extrabold tracking-tight">
                  {formatRub(plan.priceRub)}
                  <span className="text-base font-semibold text-muted">/мес</span>
                </p>
              </div>
              <ul className="grid gap-1 text-sm">
                {rows.map(([key, , one, few, many]) => (
                  <li key={key}>{countLine(quota[key], one, few, many)}</li>
                ))}
              </ul>
              <details className="text-sm">
                <summary className="cursor-pointer font-bold">Подробнее</summary>
                <p className="mt-2 text-muted">
                  {agentFillsProfile(plan.id)
                    ? "Анкету заполняем по вашим ответам."
                    : "Анкету заполняете сами."}{" "}
                  Реклама идёт с депозита, сумму называете вы.
                </p>
              </details>
              <Link href={`/register?plan=${plan.id}`} className={`${buttonClass()} mt-auto w-full`}>
                Выбрать тариф
              </Link>
            </article>
          );
        })}
      </div>
      <div className="mt-6 hidden overflow-hidden rounded-[24px] border border-line lg:grid lg:grid-cols-5">
        <div className="bg-paper p-3 text-sm font-bold">В день</div>
        {plans.map((plan) => (
          <div key={plan.id} className="border-l border-line bg-card p-3 text-sm font-extrabold">
            {plan.title}
          </div>
        ))}
        {rows.map(([key, label]) => (
          <div key={key} className="contents">
            <div className="border-t border-line bg-paper p-3 text-sm">{label}</div>
            {plans.map((plan) => (
              <div key={`${plan.id}-${key}`} className="border-t border-l border-line bg-card p-3 text-sm">
                {DAILY_QUOTA[plan.id][key]}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
