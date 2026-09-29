import { Banner, Field, PageTitle, buttonClass } from "@/components/ui";
import { loadOnboarding } from "@/lib/queries/cabinet";
import { requireClient } from "@/lib/session";
import { onboardingAction } from "@/server/cabinet-actions";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireClient();
  const data = await loadOnboarding(user.id);
  const params = await searchParams;
  return (
    <main className="grid max-w-xl gap-4">
      <PageTitle title="Онбординг" text="Пароль Авито и SMS-коды сюда не вводятся." />
      <Banner message={params.error} />
      <form action={onboardingAction} className="grid gap-3">
        <Field label="Имя / компания">
          <input name="company" defaultValue={data.companyName} required />
        </Field>
        <Field label="Телефон">
          <input name="phone" type="tel" defaultValue={data.phone} required />
        </Field>
        <Field label="Telegram" hint="Для алертов. Для бота нужен числовой chat id">
          <input name="telegram" defaultValue={data.telegram} />
        </Field>
        <Field label="Телефон входа в Авито" hint="Это подсказка для оператора, не пароль">
          <input name="avitoPhone" type="tel" defaultValue={data.avitoPhone} required />
        </Field>
        <Field label="Способ работы">
          <select name="workMode" defaultValue={data.workMode}>
            <option value="own_cabinet">Мой кабинет</option>
            <option value="materials_only">Пока только материалы</option>
          </select>
        </Field>
        <Field label="Города продаж" hint="Через запятую">
          <input name="cities" defaultValue={data.cities} required />
        </Field>
        <Field label="Категории" hint="Через запятую">
          <input name="categories" defaultValue={data.categories} required />
        </Field>
        <Field label="Лимит рекламы задаётся в разделе «Продвижение»">
          <input value="0 ₽ — без автопродвижения, пока не включите" disabled />
        </Field>
        <Field label="Правила ответов">
          <textarea name="replyRules" defaultValue={data.replyRules} />
        </Field>
        <Field label="Кого эскалировать сразу">
          <textarea name="escalateRules" defaultValue={data.escalateRules} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input name="consent" type="checkbox" className="mt-1 w-auto" required />
          <span>
            Согласен на ведение кабинета. <a href="/offer">Оферта</a>
          </span>
        </label>
        <button className={buttonClass()}>Сохранить</button>
      </form>
    </main>
  );
}
