"use client";

import { useEffect, useRef, useState } from "react";
import { OpsAssistant } from "@/components/ops-assistant";

const steps = [
  {
    title: "Скажите, что нужно сделать",
    text: "Текстом или голосом.",
    example: "«Размести баню 6×2,4 за 570 000 ₽ по Москве и области».",
  },
  {
    title: "OPS собирает карточку",
    text: "Заголовок, описание, параметры, цена, фото и недостающие вопросы.",
  },
  {
    title: "Вы подтверждаете",
    text: "Перед важным действием OPS показывает, что собирается сделать.",
  },
  {
    title: "OPS продолжает работу",
    text: "Публикация, правки, ответы и продвижение — в рамках подключённых возможностей.",
  },
] as const;

function Visual({ step }: { step: number }) {
  if (step === 0) {
    return (
      <div className="grid gap-3">
        <p className="text-xs font-bold tracking-wide text-muted uppercase">Сообщение</p>
        <p className="rounded-2xl bg-white px-4 py-3 text-sm font-medium">
          Размести баню 6×2,4 за 570 000 ₽ по Москве и области
        </p>
      </div>
    );
  }
  if (step === 1) {
    return (
      <div className="grid gap-3">
        <p className="text-xs font-bold tracking-wide text-muted uppercase">Карточка</p>
        <div className="grid gap-2 rounded-2xl bg-white p-4">
          <div className="h-16 rounded-xl bg-paper" />
          <p className="font-extrabold">Каркасная баня 6×2,4</p>
          <p className="text-sm text-muted">570 000 ₽ · Москва и область</p>
        </div>
      </div>
    );
  }
  if (step === 2) {
    return (
      <div className="grid gap-3">
        <p className="text-xs font-bold tracking-wide text-muted uppercase">Подтверждение</p>
        <p className="rounded-2xl bg-white px-4 py-3 text-sm">
          Карточка готова. Цена 570 000 ₽, Москва и область. Публикуем?
        </p>
        <div className="flex gap-2 text-sm font-bold">
          <span className="rounded-xl border border-line bg-white px-3 py-2">Изменить</span>
          <span className="rounded-xl bg-ink px-3 py-2 text-white">Подтвердить</span>
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      <p className="text-xs font-bold tracking-wide text-muted uppercase">Дальше по задаче</p>
      {["Публикация", "Правка", "Ответ покупателю", "Продвижение"].map((item) => (
        <p key={item} className="rounded-xl bg-white px-3 py-2 text-sm font-semibold">
          {item}
        </p>
      ))}
    </div>
  );
}

export function OpsWorkflow() {
  const [active, setActive] = useState(0);
  const items = useRef<Array<HTMLLIElement | null>>([]);

  useEffect(() => {
    const nodes = items.current.filter((node): node is HTMLLIElement => Boolean(node));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const index = nodes.indexOf(visible.target as HTMLLIElement);
        if (index >= 0) setActive(index);
      },
      { rootMargin: "-25% 0px -45% 0px", threshold: [0.25, 0.6] },
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="how" className="hero-shell py-16" aria-labelledby="how-title">
      <div className="grid max-w-3xl gap-3">
        <h2 id="how-title" className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
          Поставили задачу — OPS ведёт её до результата
        </h2>
        <p className="text-muted">
          Не нужно изучать ещё одну сложную CRM. Расскажите задачу обычными словами и подключайтесь только там, где
          требуется ваше решение.
        </p>
      </div>
      <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)] lg:items-start lg:gap-12">
        <ol className="grid gap-4">
          {steps.map((step, index) => (
            <li
              key={step.title}
              ref={(node) => {
                items.current[index] = node;
              }}
              className="ops-rise rounded-[24px] border border-line bg-card p-5"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <p className="text-sm font-extrabold text-accent">{String(index + 1).padStart(2, "0")}</p>
              <h3 className="mt-2 text-xl font-extrabold">{step.title}</h3>
              <p className="mt-2 text-muted">{step.text}</p>
              {"example" in step ? <p className="mt-3 text-sm font-medium">{step.example}</p> : null}
              <div className="mt-4 rounded-2xl bg-paper p-4 lg:hidden" aria-hidden="true">
                <Visual step={index} />
              </div>
            </li>
          ))}
        </ol>
        <div className="hidden self-start lg:block">
          <div className="sticky top-24 h-fit rounded-[24px] border border-line bg-paper p-5" aria-hidden="true">
            <div className="mb-4 flex items-center gap-3">
              <span className="size-12">
                <OpsAssistant state={active === 1 ? "working" : active === 2 ? "attention" : "idle"} />
              </span>
              <p className="text-sm font-extrabold">OPS</p>
            </div>
            <Visual step={active} />
          </div>
        </div>
      </div>
    </section>
  );
}
