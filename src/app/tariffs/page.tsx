import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { SiteFooter } from "@/components/site-footer";
import { buttonClass } from "@/components/ui";
import { formatRub } from "@/lib/format";
import { PLANS } from "@/lib/plans";

export default function TariffsPage() {
  const plans = Object.values(PLANS);
  return (
    <>
      <PublicHeader />
      <main className="shell grid gap-8 py-12">
        <div className="grid gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">Тарифы</h1>
          <p className="max-w-2xl text-muted">
            Тарифы отличаются тем, сколько объявлений в день выкладывается, сколько правок в день делается и сколько
            объявлений в день ставится на продвижение. Ответы идут по вашим правилам. Реклама Авито в цену не входит: её
            кладёте на депозит. Новому аккаунту первый день даётся тариф Сеть без оплаты. На Старте анкету заполняете
            сами, на остальных тарифах мы заполняем её по вашим ответам.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <article key={plan.id} className="flex flex-col gap-4 rounded-[20px] border border-line bg-card p-5">
              <div>
                <h2 className="text-2xl font-extrabold">{plan.title}</h2>
                <p className="text-sm text-muted">{plan.hint}</p>
                <p className="mt-2 text-3xl font-extrabold tracking-tight">
                  {formatRub(plan.priceRub)}
                  <span className="text-base font-semibold text-muted">/мес</span>
                </p>
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
        <section className="grid max-w-3xl gap-3">
          <h2 className="text-2xl font-extrabold tracking-tight">Как вы получаете услугу</h2>
          <p className="text-muted">
            Это услуга, не товар. Доставки и самовывоза нет. Вы регистрируетесь, выбираете тариф и отправляете заявку на
            оплату. Когда оператор отмечает оплату, оплаченный месяц начинается в кабинете на этом сайте: публикации,
            правки и ответы идут в вашем кабинете Авито. Рекламу Авито вы кладёте отдельно на депозит.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
