"use client";

import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui";
import { useCurator, type ProfileDraft } from "@/components/curator-provider";

type Step = {
  key: keyof ProfileDraft;
  ask: string;
  optional?: boolean;
  choices?: { label: string; value: string }[];
};

const steps: Step[] = [
  { key: "company", ask: "Как вас называть или как называется компания?" },
  { key: "phone", ask: "Какой телефон написать для связи?" },
  {
    key: "avitoPhone",
    ask: "С какого телефона входите в Авито? Это подсказка для нас, не пароль и не код из SMS.",
  },
  { key: "telegram", ask: "Есть Telegram? Напишите имя или номер. Если нет — нажмите «Пропустить».", optional: true },
  {
    key: "workMode",
    ask: "Где нам работать?",
    choices: [
      { label: "В моём кабинете Авито", value: "own_cabinet" },
      { label: "Пока только пришлю материалы", value: "materials_only" },
    ],
  },
  { key: "cities", ask: "В каких городах продаёте? Если несколько — через запятую." },
  { key: "categories", ask: "Что продаёте? Например: диваны, ремонт окон." },
  {
    key: "replyRules",
    ask: "Что можно писать покупателям? Например: цена окончательная, доставка по городу есть, торг не обсуждаем.",
    optional: true,
  },
  {
    key: "escalateRules",
    ask: "Когда сразу написать вам, а не отвечать самим? Например: просят скидку, хотят забрать сегодня, жалуются.",
    optional: true,
  },
];

const doneText =
  "Готово, мы вписали ответы в анкету. Поставьте галочку «Согласен на ведение кабинета» и нажмите «Сохранить». Пароль Авито мы не спрашиваем.";

type Turn = { role: "user" | "assistant"; content: string };

function shownAnswer(step: Step, raw: string) {
  if (/^пропустить$/i.test(raw)) return "Пропустить";
  const choice = step.choices?.find((item) => item.value === raw);
  return choice?.label ?? raw;
}

function storedAnswer(step: Step, raw: string) {
  const text = raw.trim();
  if (step.optional && /^(нет|пропустить|-|не надо)$/i.test(text)) return "";
  if (step.key === "workMode") {
    if (text === "materials_only" || /материал/.test(text.toLowerCase())) return "materials_only";
    return "own_cabinet";
  }
  return text;
}

export function IntakeChat() {
  const { setField } = useCurator();
  const [stepIndex, setStepIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Turn[]>([{ role: "assistant", content: steps[0].ask }]);
  const threadRef = useRef<HTMLDivElement>(null);
  const step = steps[stepIndex];

  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  function accept(raw: string) {
    if (done) return;
    const text = raw.trim();
    if (!text && !step.optional) {
      setMessages((current) => [...current, { role: "assistant", content: "Напишите ответ, это поле нужно." }]);
      return;
    }
    const value = storedAnswer(step, text || "пропустить");
    setField(step.key, value);
    const next = stepIndex + 1;
    const userText = shownAnswer(step, text || "Пропустить");
    if (next >= steps.length) {
      setMessages((current) => [
        ...current,
        { role: "user", content: userText },
        { role: "assistant", content: doneText },
      ]);
      setDone(true);
      setDraft("");
      return;
    }
    setStepIndex(next);
    setDraft("");
    setMessages((current) => [
      ...current,
      { role: "user", content: userText },
      { role: "assistant", content: steps[next].ask },
    ]);
  }

  return (
    <div className="grid gap-3">
      <div ref={threadRef} className="grid max-h-72 gap-2 overflow-y-auto pr-1">
        {messages.map((turn, index) => (
          <p
            key={`${turn.role}-${index}`}
            className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
              turn.role === "user" ? "justify-self-end bg-ink text-white" : "justify-self-start bg-paper"
            }`}
          >
            {turn.content}
          </p>
        ))}
      </div>
      {done ? null : (
        <>
          {step.choices ? (
            <div className="grid gap-2">
              {step.choices.map((choice) => (
                <button key={choice.value} type="button" className={buttonClass("ghost")} onClick={() => accept(choice.value)}>
                  {choice.label}
                </button>
              ))}
            </div>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                accept(draft);
              }}
            >
              <label className="sr-only" htmlFor="intake-answer">
                Ответ
              </label>
              <input
                id="intake-answer"
                className="min-w-0 flex-1"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Напишите ответ"
                maxLength={800}
              />
              <button className={buttonClass()} type="submit">
                Дальше
              </button>
            </form>
          )}
          {step.optional ? (
            <button type="button" className="justify-self-start text-xs font-semibold text-muted" onClick={() => accept("пропустить")}>
              Пропустить
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
