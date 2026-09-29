"use client";

import { useEffect, useState } from "react";
import { useCurator, type ProfileDraft } from "@/components/curator-provider";
import { Field, buttonClass } from "@/components/ui";
import { onboardingAction } from "@/server/cabinet-actions";

export function OnboardingForm({
  initial,
  canAgentFill,
}: {
  initial: ProfileDraft;
  canAgentFill: boolean;
}) {
  const { startIntake, patch } = useCurator();
  const [values, setValues] = useState(initial);

  useEffect(() => {
    if (!patch) return;
    setValues((current) => ({ ...current, [patch.key]: patch.value }));
    document.querySelector<HTMLElement>(`[name="${patch.key}"]`)?.scrollIntoView({ block: "center" });
  }, [patch]);

  return (
    <div className="grid gap-4">
      {canAgentFill ? (
        <div className="grid gap-3 rounded-[20px] border border-line bg-card p-5">
          <p className="text-sm">
            Агент задаст простые вопросы и сам впишет ответы в поля ниже. Галочку согласия поставите вы.
          </p>
          <button type="button" className={`${buttonClass()} w-fit`} onClick={startIntake}>
            Заполнить агенту вместо меня
          </button>
        </div>
      ) : (
        <p className="rounded-[20px] border border-line bg-card px-4 py-3 text-sm text-muted">
          На тарифах Рост, Бизнес и Сеть эту анкету может заполнить агент. На Старте поля заполняются вручную.
        </p>
      )}
      <form action={onboardingAction} className="grid gap-4 rounded-[20px] border border-line bg-card p-5 sm:grid-cols-2">
        <Field label="Имя / компания">
          <input
            name="company"
            value={values.company}
            onChange={(event) => setValues({ ...values, company: event.target.value })}
            required
          />
        </Field>
        <Field label="Телефон">
          <input
            name="phone"
            type="tel"
            value={values.phone}
            onChange={(event) => setValues({ ...values, phone: event.target.value })}
            required
          />
        </Field>
        <Field label="Telegram" hint="Можно не заполнять">
          <input
            name="telegram"
            value={values.telegram}
            onChange={(event) => setValues({ ...values, telegram: event.target.value })}
          />
        </Field>
        <Field label="Телефон входа в Авито" hint="Это подсказка для оператора, не пароль">
          <input
            name="avitoPhone"
            type="tel"
            value={values.avitoPhone}
            onChange={(event) => setValues({ ...values, avitoPhone: event.target.value })}
            required
          />
        </Field>
        <Field label="Где работать помощнику">
          <select
            name="workMode"
            value={values.workMode}
            onChange={(event) =>
              setValues({
                ...values,
                workMode: event.target.value === "materials_only" ? "materials_only" : "own_cabinet",
              })
            }
          >
            <option value="own_cabinet">В моём кабинете Авито</option>
            <option value="materials_only">Пока только пришлю материалы</option>
          </select>
        </Field>
        <Field label="Города продаж" hint="Через запятую">
          <input
            name="cities"
            value={values.cities}
            onChange={(event) => setValues({ ...values, cities: event.target.value })}
            required
          />
        </Field>
        <Field label="Что продаёте" hint="Через запятую">
          <input
            name="categories"
            value={values.categories}
            onChange={(event) => setValues({ ...values, categories: event.target.value })}
            required
          />
        </Field>
        <Field className="sm:col-span-2" label="Лимит рекламы задаётся в разделе «Продвижение»">
          <input value="0 ₽ — без автопродвижения, пока не включите" disabled />
        </Field>
        <Field className="sm:col-span-2" label="Как отвечать покупателям">
          <span className="text-xs text-muted">
            Что помощнику можно говорить в чате Авито. Например: цена окончательная, доставка по городу есть, торг не
            обсуждаем.
          </span>
          <textarea
            name="replyRules"
            value={values.replyRules}
            onChange={(event) => setValues({ ...values, replyRules: event.target.value })}
            placeholder="Цена окончательная. Доставка по городу есть. Торг не обсуждаем."
          />
        </Field>
        <Field className="sm:col-span-2" label="Когда сразу написать вам">
          <span className="text-xs text-muted">
            Обычно помощник отвечает сам. Напишите, когда он должен остановиться и передать сообщение вам.
          </span>
          <textarea
            name="escalateRules"
            value={values.escalateRules}
            onChange={(event) => setValues({ ...values, escalateRules: event.target.value })}
            placeholder="Сразу мне: хотят купить сегодня, просят скидку, жалуются."
          />
        </Field>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input name="consent" type="checkbox" required />
          <span>
            Согласен на ведение кабинета. <a href="/offer">Оферта</a>
          </span>
        </label>
        <button className={`${buttonClass()} sm:col-span-2 sm:justify-self-start`}>Сохранить</button>
      </form>
    </div>
  );
}
