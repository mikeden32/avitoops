"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { VoiceButton } from "@/components/curator-mark";
import { OpsAssistant, type OpsState } from "@/components/ops-assistant";
import { useCurator } from "@/components/curator-provider";
import type { GuestTaskView } from "@/lib/services/guest-draft";
import { askCurator, loadGuestTask, resetGuestTask } from "@/server/curator-actions";

const prompts = ["Продаю каркасные дома", "Сдаю рефконтейнеры", "Устанавливаю септики"] as const;

type Phase = "idle" | "thinking" | "building" | "success" | "ready" | "error";

type Preview = {
  title: string;
  price: string;
  city: string;
  body: string;
  photo: string | null;
  size: string;
};

type Turn = { role: "user" | "assistant"; content: string };

function money(value: number) {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

function previewFromTask(task: GuestTaskView): Preview {
  return {
    title: task.title ?? "",
    price: task.price ? money(task.price) : "",
    city: task.location ?? "",
    body: task.description ?? "",
    photo: null,
    size: task.attributes.size ?? "",
  };
}

export function OpsHero() {
  const { stopVoice, armVoice, playVoice, registerSender } = useCurator();
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [hearing, setHearing] = useState(false);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [handoff, setHandoff] = useState(false);
  const [reply, setReply] = useState("");
  const [action, setAction] = useState<{ href: string; label: string } | null>(null);
  const [history, setHistory] = useState<Turn[]>([]);

  useEffect(() => {
    let live = true;
    void loadGuestTask().then((loaded) => {
      if (!live || !loaded) return;
      if ("expired" in loaded) {
        setNote("Временная сессия закончилась. Начните задачу ещё раз.");
        return;
      }
      setHistory(loaded.transcript.slice(-8));
      const last = [...loaded.transcript].reverse().find((turn) => turn.role === "assistant");
      if (last) setReply(last.content);
      if (loaded.product || loaded.location || loaded.price) {
        setPreview(previewFromTask(loaded));
        setHandoff(loaded.completeness === "ready" && Boolean(loaded.title));
        setPhase("ready");
      }
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    registerSender((text) => {
      setDraft(text);
    });
    return () => registerSender(null);
  }, [registerSender]);

  useEffect(() => {
    if (phase !== "building") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setPhase("ready");
      return;
    }
    const success = window.setTimeout(() => setPhase("success"), 900);
    return () => window.clearTimeout(success);
  }, [phase]);

  useEffect(() => {
    if (phase !== "success") return;
    const ready = window.setTimeout(() => setPhase("ready"), 800);
    return () => window.clearTimeout(ready);
  }, [phase]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || phase === "thinking" || phase === "building") return;
    stopVoice();
    armVoice();
    const prior = history.slice(-6);
    setNote("");
    setAction(null);
    setPhase("thinking");
    try {
      const data = new FormData();
      data.set("message", message);
      data.set("history", JSON.stringify(prior));
      const result = await askCurator(data);
      if ("error" in result) {
        setPhase("error");
        setNote(result.error);
        return;
      }
      setReply(result.reply);
      if (result.task && (result.task.product || result.task.location || result.task.price)) {
        const complete = result.task.completeness === "ready" && Boolean(result.task.title);
        setHandoff(complete);
        setPreview(previewFromTask(result.task));
      } else if (result.card) {
        setHandoff(false);
        setPreview({
          title: result.card.title,
          price: result.card.priceRub ? money(result.card.priceRub) : "",
          city: result.card.city,
          body: result.card.body,
          photo: result.card.photo,
          size: "",
        });
      } else {
        setHandoff(false);
        setPreview(null);
        setPhase("idle");
      }
      setAction(result.task?.completeness === "ready" ? null : (result.action ?? null));
      setHistory((current) => {
        const next: Turn[] = [
          ...current,
          { role: "user", content: message },
          { role: "assistant", content: result.reply },
        ];
        return next.slice(-8);
      });
      setDraft("");
      if ((result.task && (result.task.product || result.task.location || result.task.price)) || result.card) setPhase("building");
      if (result.audio) playVoice(result.audio);
    } catch {
      setPhase("error");
      setNote("Не удалось получить ответ OPS. Попробовать ещё раз");
    }
  }

  async function restart() {
    if (!window.confirm("Начать заново? Текущее объявление на этом устройстве сотрётся.")) return;
    await resetGuestTask();
    setPreview(null);
    setHandoff(false);
    setReply("");
    setHistory([]);
    setDraft("");
    setAction(null);
    setNote("");
    setPhase("idle");
  }

  const opsState: OpsState = hearing
    ? "listening"
    : phase === "thinking"
      ? "thinking"
      : phase === "building"
        ? "working"
        : phase === "success"
          ? "success"
          : phase === "error"
            ? "error"
            : phase === "ready"
              ? "attention"
              : "idle";

  const showSkeleton = phase === "thinking";
  const showFields = preview && (phase === "building" || phase === "success" || phase === "ready");

  return (
    <section className="bg-white" id="ops">
      <div className="hero-shell grid gap-10 py-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-16 lg:py-16">
        <div className="grid min-w-0 gap-5">
          <div className="grid gap-3">
            <h1 className="text-[2.25rem] leading-[1.05] font-extrabold tracking-tight sm:text-5xl lg:text-[3.5rem]">
              Скажите, что продаёте.{"\u00A0"}
              <br />
              OPS сделает остальное.
            </h1>
            <p className="max-w-xl text-base text-muted sm:text-lg">
              Создаст объявление, подготовит текст и карточку, поможет с публикацией, ответами и продвижением. Вы только
              подтверждаете важные решения.
            </p>
          </div>
          <form
            className="relative"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <label className="sr-only" htmlFor="ops-command">
              Задача для OPS
            </label>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted">
              <path
                d="M5 6.5h14v9H8.5L5 18.5z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
            </svg>
            <input
              id="ops-command"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Расскажите своими словами, что хотите продать…"
              maxLength={800}
              className="h-14 pr-28 pl-11"
              autoComplete="off"
            />
            <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-1">
              <VoiceButton
                className="grid size-11 place-items-center rounded-xl text-ink transition hover:bg-paper"
                idleLabel="Сказать OPS"
                onHearing={setHearing}
                onText={(text, final) => {
                  setDraft(text);
                  if (final) void send(text);
                }}
                onMiss={setNote}
              />
              <button
                type="submit"
                className="grid size-11 place-items-center rounded-xl bg-ink text-white transition duration-200 ease-out hover:bg-black disabled:opacity-40"
                aria-label="Отправить"
                disabled={!draft.trim() || phase === "thinking" || phase === "building"}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
                  <path d="M12 19V6M7 11l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </form>
          {note ? <p className="text-sm text-muted">{note}</p> : null}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {prompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="shrink-0 rounded-full border border-line bg-card px-4 py-2.5 text-sm font-semibold transition duration-200 ease-out hover:bg-paper"
                onClick={() => {
                  setDraft(prompt);
                  document.getElementById("ops-command")?.focus();
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
          <a href="#how" className="w-fit text-sm font-semibold text-accent">
            Посмотреть, как это работает
          </a>
        </div>

        <div className="grid min-w-0 justify-items-center gap-4 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:items-center lg:grid-cols-[9rem_minmax(0,1fr)]">
          <div className="size-24 shrink-0 sm:size-28 lg:size-36">
            <OpsAssistant state={opsState} />
          </div>
          <article className="w-full rounded-3xl border border-line bg-card p-4 shadow-[var(--shadow-md)]" aria-live="polite">
            <p className="text-xs font-bold tracking-[0.14em] text-brand uppercase">AI-авитолог AvitoOps</p>
            {showFields && reply && !showSkeleton ? <p className="mt-3 text-base leading-snug">{reply}</p> : null}
            {showSkeleton ? (
              <div className="mt-3 grid gap-3">
                <div className="h-28 animate-pulse rounded-2xl bg-paper" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-paper" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-paper" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-paper" />
                <div className="h-12 animate-pulse rounded-xl bg-paper" />
              </div>
            ) : null}
            {!showSkeleton && !showFields ? (
              <p className="mt-6 mb-8 text-lg font-semibold">{reply || "Расскажите, что продаём"}</p>
            ) : null}
            {showFields && preview ? (
              <div className="mt-3 grid gap-3">
                {handoff ? <h2 className="text-lg font-extrabold">OPS собрал первое объявление</h2> : null}
                <div className="ops-field grid h-28 place-items-center overflow-hidden rounded-2xl bg-paper text-sm text-muted">
                  {preview.photo ? (
                    <img src={preview.photo} alt="" className="size-full object-cover" />
                  ) : (
                    "Фото появится, когда пришлёте кадр"
                  )}
                </div>
                <p className="ops-field text-lg font-extrabold" style={{ animationDelay: "80ms" }}>
                  {preview.title}
                </p>
                {preview.price ? (
                  <p className="ops-field font-semibold" style={{ animationDelay: "160ms" }}>
                    {preview.price}
                  </p>
                ) : null}
                {preview.city ? (
                  <p className="ops-field text-sm text-muted" style={{ animationDelay: "240ms" }}>
                    {preview.city}
                  </p>
                ) : null}
                {preview.size ? <p className="ops-field text-sm text-muted">Размер {preview.size}</p> : null}
                <p className="ops-field text-sm text-ink" style={{ animationDelay: "320ms" }}>
                  {preview.body}
                </p>
                {phase === "ready" && handoff ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex h-11 items-center rounded-xl border border-line px-4 text-sm font-bold"
                      onClick={() => document.getElementById("ops-command")?.focus()}
                    >
                      Изменить
                    </button>
                    <Link
                      href="/register?from=task"
                      className="inline-flex h-11 items-center rounded-xl bg-ink px-4 text-sm font-bold text-white"
                    >
                      Сохранить и продолжить
                    </Link>
                    <Link href="/login?from=task" className="inline-flex h-11 items-center px-2 text-sm font-semibold">
                      Войти
                    </Link>
                    <button type="button" className="px-2 text-sm text-muted" onClick={() => void restart()}>
                      Начать заново
                    </button>
                  </div>
                ) : null}
                {phase === "ready" && !handoff && action ? (
                  <Link
                    href={action.href}
                    className="inline-flex h-11 w-fit items-center rounded-xl bg-ink px-4 text-sm font-bold text-white"
                  >
                    {action.label}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </article>
        </div>
      </div>
    </section>
  );
}
