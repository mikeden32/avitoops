import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { SiteFooter } from "@/components/site-footer";
import { buttonClass } from "@/components/ui";
import { formatRub } from "@/lib/format";
import { PLANS } from "@/lib/plans";

export default function TariffsPage() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-12">
        <h1 className="text-3xl font-semibold">Тарифы пилота</h1>
        <p className="max-w-2xl text-muted">
          Реклама Авито оплачивается отдельно, с депозита. Подписка — за ведение объявлений.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {Object.values(PLANS).map((plan) => (
            <article key={plan.id} className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5">
              <div>
                <h2 className="text-2xl font-semibold">{plan.title}</h2>
                <p className="mt-1 text-3xl font-semibold">{formatRub(plan.priceRub)}/мес</p>
              </div>
              <ul className="grid flex-1 gap-2 text-sm">
                {plan.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <Link href={`/register?plan=${plan.id}`} className={buttonClass()}>
                Выбрать {plan.title}
              </Link>
            </article>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
