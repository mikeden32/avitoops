"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ClipIcon, CloseIcon, RoleLights, VoiceButton } from "@/components/curator-mark";
import { OpsAssistant } from "@/components/ops-assistant";
import { buttonClass } from "@/components/ui";
import { useCurator } from "@/components/curator-provider";
import { logInfo } from "@/lib/redact";
import { DAILY_QUOTA, PLANS } from "@/lib/plans";
import type { AssistantCard, DeskRole } from "@/lib/services/sale";
import {
  consultTariff,
  planProfileLine,
  tariffFactsLine,
  tariffReply,
  tariffWelcome,
  type PublicPageContext,
  type TariffCard,
  type TariffGuide,
  type TariffPrompt,
  type TariffReply,
} from "@/lib/tariff-guide";
import { askCurator, curatorBoot, openCurator } from "@/server/curator-actions";

type Turn = {
  role: "user" | "assistant";
  content: string;
  action?: { href: string; label: string };
  card?: AssistantCard;
  planCard?: TariffCard;
  comparison?: boolean;
};

type Activity = { pending: boolean; hearing: boolean; success: boolean; expanded: boolean };

const prompts = {
  public: ["Сколько стоят тарифы?", "Что ведёте вы, а что заполняю я?", "Нужен ли пароль Авито?"],
  cabinet: ["Выложи объявление", "Поменяй цену", "Поставь на паузу"],
} as const;

const welcome = {
  public: "Здравствуйте. Я OPS. Помогу с объявлениями, тарифами и работой AvitoOps. Просто напишите или скажите, что нужно.",
  cabinet: "Здравствуйте. Я OPS. Напишите или скажите, что выложить. Перед действием повторю и дождусь вашего «да».",
} as const;

const fitSeen = { current: 0 };

const startPrompts: TariffPrompt[] = [
  { label: "Какой тариф мне подходит?" },
  { label: "Что входит в тариф?" },
  { label: "Чем отличаются тарифы?" },
  { label: "Реклама входит в стоимость?" },
];

function rub(value: number) {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

function plural(value: number, one: string, few: string, many: string) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  const word = mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
  return `${value} ${word}`;
}

function noteTariff(event: "tariff_rules_handled" | "tariff_ai_escalated", scenario: string) {
  logInfo(`[ai] ${JSON.stringify({ event, scenario, page: "tariffs" })}`);
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function ShortText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 220 || text.split("\n").length > 5;
  if (!long || open) return <p className="rounded-2xl bg-paper px-3 py-2 text-sm">{text}</p>;
  return (
    <div className="grid gap-1">
      <p className="line-clamp-4 rounded-2xl bg-paper px-3 py-2 text-sm">{text}</p>
      <button type="button" className="w-fit text-xs font-semibold text-accent" onClick={() => setOpen(true)}>
        Подробнее
      </button>
    </div>
  );
}

function PlanCard({ card, onCompare }: { card: TariffCard; onCompare?: () => void }) {
  const plan = PLANS[card.plan];
  const quota = DAILY_QUOTA[card.plan];
  const replies = plan.points.find((point) => /ответ/i.test(point));
  return (
    <article className="grid gap-2 rounded-[20px] border border-line bg-card p-3">
      <p className="text-sm font-extrabold">
        {card.mode === "recommend" ? `Вам подходит «${plan.title}»` : plan.title}
      </p>
      <p className="text-2xl font-extrabold tracking-tight">
        {rub(plan.priceRub)}
        <span className="text-sm font-semibold text-muted"> / мес</span>
      </p>
      <ul className="grid gap-1 text-sm text-muted">
        <li>{plural(quota.publish, "новое объявление", "новых объявления", "новых объявлений")} в день</li>
        <li>{plural(quota.update, "правка", "правки", "правок")} в день</li>
        <li>до {quota.promo} продвижений в день</li>
        {replies ? <li>{replies}</li> : null}
        {card.mode === "details" ? <li>{planProfileLine(card.plan)}</li> : null}
      </ul>
      {card.reason ? <p className="text-sm">{card.reason}</p> : null}
      <Link href={`/register?plan=${card.plan}`} className={`${buttonClass()} w-full`}>
        Выбрать {plan.title}
      </Link>
      {card.mode === "recommend" && onCompare ? (
        <button type="button" className={`${buttonClass("ghost")} w-full`} onClick={onCompare}>
          Сравнить тарифы
        </button>
      ) : null}
    </article>
  );
}

function Comparison() {
  return (
    <div className="grid gap-1.5">
      {Object.values(PLANS).map((plan) => {
        const quota = DAILY_QUOTA[plan.id];
        return (
          <article key={plan.id} className="rounded-xl border border-line bg-card px-3 py-2 text-sm leading-5">
            <p className="font-extrabold">{plan.title}</p>
            <p className="font-semibold">
              {rub(plan.priceRub)}
              <span className="font-semibold text-muted"> / мес</span>
            </p>
            <p className="text-muted">
              {quota.publish} новых
              <br />
              {plural(quota.update, "правка", "правки", "правок")}
              <br />
              до {quota.promo} продвижений
            </p>
          </article>
        );
      })}
    </div>
  );
}

export function CuratorChat({
  variant,
  layout = "panel",
  prompts: promptList,
  pageContext = "other",
  fitToken = 0,
  onActivity,
}: {
  variant: "public" | "cabinet";
  layout?: "panel" | "scene";
  prompts?: readonly string[];
  pageContext?: PublicPageContext;
  fitToken?: number;
  onActivity?: (activity: Activity) => void;
}) {
  const { registerSender, sendToCurator, openToken, setBusy, setLit, lit, stopVoice, armVoice, playVoice } = useCurator();
  const router = useRouter();
  const tariffs = pageContext === "tariffs" && layout === "panel";
  const [messages, setMessages] = useState<Turn[]>([
    { role: "assistant", content: tariffs ? tariffWelcome : welcome[variant] },
  ]);
  const [guide, setGuide] = useState<TariffGuide>({ step: "start" });
  const [guidePrompts, setGuidePrompts] = useState<TariffPrompt[]>(startPrompts);
  const [draft, setDraft] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [picking, setPicking] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [micNote, setMicNote] = useState("");
  const [dialog, setDialog] = useState(layout === "scene");
  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sendRef = useRef<(text: string) => void>(() => undefined);
  const guideRef = useRef(guide);
  const guided = useRef(false);
  const lock = useRef(false);
  const inputId = `curator-${variant}-${layout}`;
  guideRef.current = guide;
  const busy = pending || picking;

  function flashSuccess() {
    setSuccess(true);
    window.setTimeout(() => setSuccess(false), 1600);
  }

  async function showGuide(text: string, reply: TariffReply) {
    if (lock.current) return false;
    lock.current = true;
    guided.current = true;
    try {
      stopVoice();
      setMessages((items) => [...items, { role: "user", content: text }]);
      setDraft("");
      setGuide(reply.guide);
      guideRef.current = reply.guide;
      setGuidePrompts(reply.prompts);
      setPicking(true);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      await wait(reduce ? 0 : 360);
      setMessages((items) => [
        ...items,
        {
          role: "assistant",
          content: reply.text,
          planCard: reply.card,
          comparison: reply.comparison,
        },
      ]);
      setPicking(false);
      flashSuccess();
      noteTariff("tariff_rules_handled", reply.scenario);
      return true;
    } finally {
      lock.current = false;
    }
  }

  async function applyGuide(current: TariffGuide, text: string) {
    const reply = tariffReply(current, text);
    if (!reply) return false;
    return showGuide(text, reply);
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy || lock.current) return;
    const attached = photos;
    if (tariffs && attached.length === 0 && (await applyGuide(guideRef.current, message))) return;
    if (tariffs && attached.length === 0) {
      const consult = consultTariff(message);
      if (consult && (await showGuide(message, consult))) return;
    }
    stopVoice();
    armVoice();
    const prior = messages.slice(-5).map(({ role, content }) => ({ role, content }));
    const history = tariffs ? [{ role: "assistant" as const, content: tariffFactsLine() }, ...prior] : prior;
    setDialog(true);
    setMessages((current) => [
      ...current,
      { role: "user", content: attached.length ? `${message} Фото приложено.` : message },
    ]);
    setDraft("");
    setPhotos([]);
    setPending(true);
    setBusy(true);
    lock.current = true;
    if (tariffs) noteTariff("tariff_ai_escalated", "free_text");
    try {
      const data = new FormData();
      data.set("message", message);
      data.set("history", JSON.stringify(history));
      for (const file of attached) data.append("photo", file);
      const result = await askCurator(data);
      const content = "reply" in result ? result.reply : result.error;
      const action = "reply" in result ? result.action : undefined;
      const card = "reply" in result ? result.card : undefined;
      const audio = "reply" in result ? result.audio : null;
      if ("reply" in result && result.role) setLit(result.role);
      setMessages((current) => [...current, { role: "assistant", content, action, card }]);
      flashSuccess();
      if (action) router.refresh();
      if (audio) playVoice(audio);
    } catch {
      const content = "Не получилось отправить. Попробуйте ещё раз.";
      setMessages((current) => [...current, { role: "assistant", content }]);
    } finally {
      lock.current = false;
      setPending(false);
      setBusy(false);
    }
  }

  sendRef.current = (text: string) => {
    void send(text);
  };
  const applyRef = useRef(applyGuide);
  applyRef.current = applyGuide;

  useEffect(() => {
    registerSender((text) => sendRef.current(text));
    return () => registerSender(null);
  }, [registerSender]);

  useEffect(() => {
    if (openToken === 0) return;
    setDialog(true);
  }, [openToken]);

  useEffect(() => {
    if (!tariffs || fitToken === 0 || fitToken === fitSeen.current) return;
    fitSeen.current = fitToken;
    void applyRef.current({ step: "start" }, "Подобрать тариф");
  }, [fitToken, tariffs]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const boot = layout === "scene" || variant === "cabinet" ? await curatorBoot() : null;
      const lines = await openCurator();
      if (!alive || guided.current) return;
      const litRole = boot?.role;
      if (litRole === "copy" || litRole === "design" || litRole === "promo" || litRole === "reply") setLit(litRole satisfies DeskRole);
      const mapped: Turn[] = lines.map((line) => ({
        role: line.role === "user" ? "user" : "assistant",
        content: line.content,
        card: line.card,
      }));
      if (boot?.action && mapped.length > 0 && mapped[mapped.length - 1]?.role === "assistant") {
        mapped[mapped.length - 1] = { ...mapped[mapped.length - 1], action: boot.action };
      }
      const greeting = tariffs ? tariffWelcome : welcome[variant];
      setMessages(mapped.length ? mapped : [{ role: "assistant", content: greeting }]);
      if (boot?.open) setDialog(true);
    })();
    return () => {
      alive = false;
    };
  }, [variant, layout, setLit, tariffs]);

  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, pending, picking, dialog]);

  const expanded =
    layout === "panel" &&
    (pending ||
      picking ||
      messages.length > 1 ||
      messages.some((turn) => turn.comparison || turn.planCard || turn.card));

  useEffect(() => {
    onActivity?.({ pending: busy, hearing, success, expanded });
  }, [busy, hearing, success, expanded, onActivity]);

  useEffect(() => {
    if (layout === "scene") return;
    document.getElementById(inputId)?.focus();
  }, [inputId, layout]);

  const shownPrompts: TariffPrompt[] = tariffs
    ? guidePrompts
    : (promptList ?? prompts[variant]).map((label) => ({ label }));

  const thread = (
    <div
      ref={threadRef}
      className={`ops-thread grid gap-2 pr-1 ${
        layout === "scene" ? "max-h-80 w-full overflow-y-auto" : expanded ? "min-h-0 flex-auto overflow-y-auto" : "shrink-0"
      }`}
    >
      {messages.map((turn, index) => (
        <div
          key={`${turn.role}-${index}`}
          className={`grid gap-2 ${
            layout === "scene"
              ? turn.role === "user"
                ? "max-w-[85%] justify-self-end"
                : "w-full"
              : `max-w-[92%] ${turn.role === "user" ? "justify-self-end" : "justify-self-start"}`
          }`}
        >
          {turn.planCard ? null : turn.role === "user" ? (
            <p className="rounded-2xl bg-ink px-3 py-2 text-sm text-white">{turn.content}</p>
          ) : layout === "panel" ? (
            <ShortText text={turn.content} />
          ) : (
            <p className="rounded-2xl bg-paper px-3 py-2 text-sm">{turn.content}</p>
          )}
          {turn.planCard ? <PlanCard card={turn.planCard} onCompare={() => void send("Сравнить тарифы")} /> : null}
          {turn.comparison ? <Comparison /> : null}
          {turn.card ? (
            <article className="overflow-hidden rounded-2xl border border-line bg-card">
              {turn.card.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={turn.card.photo} alt="" className="h-40 w-full object-cover" />
              ) : (
                <p className="px-3 pt-3 text-xs text-muted">Фото ещё нет</p>
              )}
              <div className="grid gap-1 p-3 text-sm">
                <p className="font-extrabold">{turn.card.title}</p>
                <p>
                  {rub(turn.card.priceRub)} · {turn.card.city}
                </p>
                <p className="text-muted">{turn.card.body}</p>
                <Link href={turn.card.href} className="font-semibold underline">
                  Открыть карточку
                </Link>
                <span className="flex gap-3">
                  <Link href="/app/copy" className="font-semibold underline">
                    Копирайтер
                  </Link>
                  <Link href="/app/design" className="font-semibold underline">
                    Дизайнер
                  </Link>
                </span>
              </div>
            </article>
          ) : null}
          {turn.action ? (
            <Link href={turn.action.href} className={`${buttonClass()} w-fit`}>
              {turn.action.label}
            </Link>
          ) : null}
        </div>
      ))}
      {busy ? (
        <p className="text-sm text-muted" aria-live="polite">
          {layout === "panel" ? "Подбираю…" : "OPS пишет…"}
        </p>
      ) : null}
    </div>
  );

  const form = (
    <form
      className={`flex w-full shrink-0 items-center gap-1 ${layout === "scene" ? "rounded-full bg-paper px-1" : "gap-2"}`}
      onSubmit={(event) => {
        event.preventDefault();
        void send(draft);
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(event) => setPhotos(Array.from(event.target.files ?? []))}
      />
      <button
        type="button"
        className="grid size-9 shrink-0 place-items-center rounded-full text-ink transition hover:bg-paper disabled:opacity-40"
        aria-label={photos.length ? `Прикрепить фото, выбрано ${photos.length}` : "Прикрепить фото"}
        onClick={() => fileRef.current?.click()}
        disabled={busy}
      >
        <ClipIcon />
      </button>
      <label className="sr-only" htmlFor={inputId}>
        Сообщение OPS
      </label>
      <input
        id={inputId}
        className="min-w-0 flex-1 border-0 bg-transparent"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Напишите или скажите"
        maxLength={800}
        disabled={busy}
      />
      {draft.trim() && !hearing ? (
        <button
          className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-white disabled:opacity-40"
          type="submit"
          aria-label="Отправить"
          disabled={busy}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
            <path d="M12 19V6M7 11l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <VoiceButton
          className="grid size-9 shrink-0 place-items-center rounded-full text-ink transition hover:bg-paper disabled:opacity-40"
          onHearing={setHearing}
          onMiss={setMicNote}
          idleLabel="Микрофон"
          onText={(text, final) => {
            setMicNote("");
            setDraft(text);
            if (final) sendToCurator(text);
          }}
        />
      )}
    </form>
  );

  const quick = (
    <div className="flex shrink-0 flex-wrap gap-2">
      {shownPrompts.map((prompt) =>
        prompt.href ? (
          <Link
            key={prompt.label}
            href={prompt.href}
            className="rounded-xl bg-paper px-3 py-1.5 text-xs font-semibold transition duration-200 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.98]"
          >
            {prompt.label}
          </Link>
        ) : (
          <button
            key={prompt.label}
            type="button"
            className="rounded-xl bg-paper px-3 py-1.5 text-xs font-semibold transition duration-200 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.98] disabled:opacity-50"
            onClick={() => {
              if (prompt.label === "Сравнить тарифы") {
                void send("Сравнить тарифы");
                return;
              }
              void send(prompt.label);
            }}
            disabled={busy}
          >
            {prompt.label}
          </button>
        ),
      )}
    </div>
  );

  if (layout === "scene") {
    return (
      <section className="mx-auto grid w-full max-w-xl gap-4">
        <div className="grid justify-items-center gap-2">
          <button
            type="button"
            className="size-28 sm:size-36"
            aria-label={dialog ? "OPS" : "Открыть диалог"}
            onClick={() => setDialog(true)}
          >
            <OpsAssistant state={pending ? "thinking" : "idle"} />
          </button>
          <p className="text-sm font-extrabold">OPS</p>
          <RoleLights active={lit} />
        </div>
        <div className="grid gap-2 rounded-[28px] border border-line bg-card p-2 sm:p-3">
          <div className="flex h-8 items-center px-1">
            {dialog ? (
              <button
                type="button"
                className="ml-auto grid size-8 place-items-center rounded-full text-ink transition hover:bg-paper"
                aria-label="Закрыть диалог"
                onClick={() => setDialog(false)}
              >
                <CloseIcon />
              </button>
            ) : (
              <button type="button" className="mx-auto text-sm font-semibold" onClick={() => setDialog(true)}>
                Открыть диалог
              </button>
            )}
          </div>
          {dialog ? thread : null}
          {form}
          {micNote ? <p className="px-2 text-xs text-muted">{micNote}</p> : null}
        </div>
      </section>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {thread}
      {quick}
      {expanded ? null : <div className="min-h-2 flex-1" aria-hidden="true" />}
      {form}
      {micNote ? <p className="text-xs text-muted">{micNote}</p> : null}
    </div>
  );
}
