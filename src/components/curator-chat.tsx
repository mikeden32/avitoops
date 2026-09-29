"use client";

import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui";
import { askCurator } from "@/server/curator-actions";

type Turn = { role: "user" | "assistant"; content: string };

const prompts = {
  public: ["Сколько стоят тарифы?", "Что ведёте вы, а что заполняю я?", "Нужен ли пароль Авито?"],
  cabinet: ["Где завести объявление?", "Как пополнить депозит?", "Как остановить работу?"],
} as const;

export function CuratorChat({ variant }: { variant: "public" | "cabinet" }) {
  const welcome =
    variant === "public"
      ? "Здравствуйте. Мы команда AvitoOps: копирайтер, дизайнер и менеджер по общению. Новым — 1 день тарифа Сеть бесплатно. До регистрации отвечаем коротко по сайту."
      : "Мы команда AvitoOps. Спросите, куда ввести объявление, депозит или как поставить паузу. Из чата мы ничего не публикуем.";
  const [messages, setMessages] = useState<Turn[]>([{ role: "assistant", content: welcome }]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputId = `curator-${variant}`;

  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, pending]);

  useEffect(() => {
    document.getElementById(inputId)?.focus();
  }, [inputId]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || pending) return;
    const history = messages.slice(-6);
    setMessages((current) => [...current, { role: "user", content: message }]);
    setDraft("");
    setPending(true);
    try {
      const result = await askCurator({ message, history });
      const content = "reply" in result ? result.reply : result.error;
      setMessages((current) => [...current, { role: "assistant", content }]);
    } catch {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: "Не получилось отправить вопрос. Попробуйте ещё раз." },
      ]);
    } finally {
      setPending(false);
    }
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
        {pending ? <p className="text-sm text-muted">Куратор пишет…</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {prompts[variant].map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="rounded-xl bg-paper px-3 py-1.5 text-xs font-semibold transition duration-200 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.98] disabled:opacity-50"
            onClick={() => send(prompt)}
            disabled={pending}
          >
            {prompt}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <label className="sr-only" htmlFor={inputId}>
          Вопрос куратору
        </label>
        <input
          id={inputId}
          className="min-w-0 flex-1"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Напишите вопрос"
          maxLength={800}
          disabled={pending}
        />
        <button className={buttonClass()} type="submit" disabled={pending}>
          Спросить
        </button>
      </form>
    </div>
  );
}
