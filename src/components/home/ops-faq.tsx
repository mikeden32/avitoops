"use client";

import { useId, useState } from "react";

const items = [
  [
    "Нужен ли свой аккаунт на Авито?",
    "Да. Объявления выходят в вашем кабинете Авито. Кабинет за вас не создаём. Подключение открывается кнопкой «Перейти в Авито», без пароля площадки и без SMS.",
  ],
  [
    "Нужен ли пароль?",
    "Пароль Авито не нужен и не хранится. Для входа на AvitoOps при регистрации задаётся только пароль сайта.",
  ],
  [
    "OPS может сам публиковать объявления?",
    "OPS собирает карточку и перед выкладкой ждёт отдельное «да». Без вашего подтверждения объявление на площадку не уходит. В первые сутки можно выложить одно объявление, дальше работает оплаченный тариф.",
  ],
  [
    "Кто отвечает покупателям?",
    "Ответы идут по правилам, которые вы задали. Если вопрос из списка «написать вам», его приносят вам в тот же диалог и на Авито не отправляют.",
  ],
  [
    "Можно ли поставить работу на паузу?",
    "Да. Пауза останавливает новые публикации, правки, ответы и продвижение.",
  ],
  [
    "Реклама входит в тариф?",
    "Нет. Тариф задаёт объём работы в день. Реклама на площадке оплачивается отдельно, с депозита. Сумму называете вы.",
  ],
  [
    "Что будет, если OPS не знает ответ?",
    "Такой вопрос приходит вам. На площадку ответ сам не уходит.",
  ],
  [
    "Можно ли пользоваться с телефона?",
    "Да. Сайт открывается в браузере телефона: главная, тарифы и кабинет подстраиваются под экран. Отдельное приложение не нужно.",
  ],
] as const;

function Item({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="border-b border-line">
      <h3>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 py-4 text-left font-extrabold"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          {question}
          <span aria-hidden="true" className="text-muted">
            {open ? "–" : "+"}
          </span>
        </button>
      </h3>
      <div id={panelId} hidden={!open} className="pb-4 text-sm text-muted">
        {answer}
      </div>
    </div>
  );
}

export function OpsFaq() {
  return (
    <section className="hero-shell py-16" aria-labelledby="faq-title">
      <h2 id="faq-title" className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
        Вопросы
      </h2>
      <div className="mt-6">
        {items.map(([question, answer]) => (
          <Item key={question} question={question} answer={answer} />
        ))}
      </div>
    </section>
  );
}
