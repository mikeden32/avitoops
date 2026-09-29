"use client";

import { useEffect, useId, useState } from "react";
import { usePathname } from "next/navigation";
import { CuratorChat } from "@/components/curator-chat";
import { IntakeChat } from "@/components/intake-chat";
import { useCurator } from "@/components/curator-provider";

const COLLAPSED_KEY = "avitoops-curator-collapsed";

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5">
      <path
        d={dir === "right" ? "M6 3.5 10.5 8 6 12.5" : "M10 3.5 5.5 8 10 12.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CuratorMark({ live = false }: { live?: boolean }) {
  const uid = useId().replace(/:/g, "");
  return (
    <span className="relative block size-full overflow-hidden rounded-[18px] bg-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.8)]">
      <svg viewBox="0 0 64 64" aria-hidden="true" className="size-full">
        <defs>
          <linearGradient id={`${uid}-shell`} x1="32" y1="8" x2="32" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#d5dee6" />
          </linearGradient>
          <linearGradient id={`${uid}-visor`} x1="32" y1="24" x2="32" y2="42" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#243040" />
            <stop offset="1" stopColor="#0c1218" />
          </linearGradient>
          <radialGradient id={`${uid}-eye`} cx="38%" cy="35%" r="70%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.42" stopColor="#7ad7ff" />
            <stop offset="1" stopColor="#0095e0" />
          </radialGradient>
        </defs>
        <path d="M32 6.5v5" stroke="#b7c3ce" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="32" cy="6" r="2" className={live ? "curator-pulse" : undefined} fill="#00aaff" />
        <rect x="9" y="12" width="46" height="46" rx="20" fill={`url(#${uid}-shell)`} />
        <ellipse cx="32" cy="22" rx="13" ry="5" fill="#ffffff" opacity="0.72" />
        <rect x="15" y="25" width="34" height="15" rx="7.5" fill={`url(#${uid}-visor)`} />
        <g className="curator-look">
          <g className="curator-blink">
            <circle cx="26" cy="32.5" r="3.3" fill={`url(#${uid}-eye)`} />
            <circle cx="38" cy="32.5" r="3.3" fill={`url(#${uid}-eye)`} />
          </g>
        </g>
        <path
          className="curator-mouth"
          d="M26.5 46.5c1.7 1.8 3.5 2.7 5.5 2.7s3.8-.9 5.5-2.7"
          fill="none"
          stroke="#00aaff"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function CuratorWidget() {
  const pathname = usePathname();
  const variant = pathname.startsWith("/app") ? "cabinet" : "public";
  const { intakeToken } = useCurator();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState<"chat" | "intake">("chat");
  const titleId = useId();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      /* хранилище может быть закрыто */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* предпочтение просто не сохранится */
      }
      return next;
    });
  }

  useEffect(() => {
    if (intakeToken === 0) return;
    setMode("intake");
    setOpen(true);
  }, [intakeToken]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
    {open ? (
      <button
        type="button"
        className="fixed inset-0 z-40 bg-ink/20"
        aria-label="Закрыть диалог"
        onClick={() => setOpen(false)}
      />
    ) : null}
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3">
      {open ? (
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="curator-in pointer-events-auto grid w-[min(100vw-2rem,22rem)] gap-3 overflow-hidden rounded-[20px] border border-line bg-card shadow-[0_16px_40px_rgba(20,20,20,0.16)]"
        >
          <header className="flex items-center gap-3 border-b border-line bg-ink px-4 py-3 text-white">
            <span className="size-10 shrink-0">
              <CuratorMark live />
            </span>
            <div className="min-w-0">
              <p id={titleId} className="text-sm font-extrabold">
                Авито-куратор
              </p>
              <p className="text-xs text-white/70">
                {mode === "intake" ? "Заполняем анкету" : "Спросите про сайт и кабинет"}
              </p>
            </div>
            <button
              type="button"
              className="ml-auto rounded-xl px-2 py-1 text-sm font-bold text-white/70 transition hover:bg-white/10 hover:text-white"
              onClick={() => setOpen(false)}
            >
              Закрыть
            </button>
          </header>
          <div className="px-4 pb-4">
            {mode === "intake" ? <IntakeChat key={intakeToken} /> : <CuratorChat key={variant} variant={variant} />}
          </div>
        </section>
      ) : null}
      <div className="pointer-events-auto flex items-center">
        <div
          className={
            collapsed
              ? "relative flex"
              : "flex items-center rounded-2xl bg-ink py-1.5 pr-1.5 pl-1.5 text-white shadow-[0_10px_28px_rgba(20,20,20,0.28)]"
          }
        >
          {collapsed ? (
            <button
              type="button"
              className="absolute top-1/2 right-full z-10 mr-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-full border border-line bg-white text-ink shadow-[0_4px_12px_rgba(20,20,20,0.16)] transition hover:bg-paper"
              aria-label="Развернуть подпись куратора"
              title="Развернуть подпись"
              onClick={toggleCollapsed}
            >
              <Chevron dir="right" />
            </button>
          ) : null}
          <button
            type="button"
            className={
              collapsed
                ? "relative size-12 shrink-0 rounded-[18px] shadow-[0_10px_28px_rgba(20,20,20,0.28)] transition duration-200 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.98]"
                : "flex items-center gap-2.5 rounded-xl pr-1 text-left transition duration-200 ease-out motion-safe:active:scale-[0.98]"
            }
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-label={open ? "Закрыть диалог с Авито-куратором" : "Открыть диалог с Авито-куратором"}
            onClick={() =>
              setOpen((value) => {
                if (!value) setMode("chat");
                return !value;
              })
            }
          >
            <span className={`relative shrink-0 ${collapsed ? "size-full" : "size-11"}`}>
              <CuratorMark live={!open} />
              <span
                className={`curator-pulse absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-brand ring-2 ${collapsed ? "ring-white" : "ring-ink"}`}
              />
            </span>
            {collapsed ? null : (
              <span className="leading-tight">
                <span className="block text-[10px] font-bold tracking-[0.14em] text-brand uppercase">на связи</span>
                <span className="block text-sm font-extrabold">Авито-куратор</span>
              </span>
            )}
          </button>
          {collapsed ? null : (
            <button
              type="button"
              className="grid size-7 shrink-0 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label="Свернуть, оставить только лицо"
              title="Свернуть"
              onClick={toggleCollapsed}
            >
              <Chevron dir="left" />
            </button>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
