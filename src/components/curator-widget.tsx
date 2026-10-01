"use client";

import { useEffect, useId, useState } from "react";
import { usePathname } from "next/navigation";
import { CuratorChat } from "@/components/curator-chat";
import { CloseIcon, WaveIcon } from "@/components/curator-mark";
import { IntakeChat } from "@/components/intake-chat";
import { OpsAssistant } from "@/components/ops-assistant";
import { useCurator } from "@/components/curator-provider";
import type { PublicPageContext } from "@/lib/tariff-guide";

type Face = "idle" | "thinking" | "listening" | "success" | "working";

type Activity = { pending: boolean; hearing: boolean; success: boolean; expanded: boolean };

function pageContextOf(pathname: string): PublicPageContext {
  if (pathname === "/") return "home";
  if (pathname === "/tariffs") return "tariffs";
  if (pathname === "/login") return "login";
  if (pathname.startsWith("/register")) return "register";
  return "other";
}

export function CuratorWidget() {
  const pathname = usePathname();
  const pageContext = pageContextOf(pathname);
  const home = pageContext === "home";
  const cabinet = pathname.startsWith("/app");
  const variant = cabinet ? "cabinet" : "public";
  const { intakeToken, openToken, fitToken } = useCurator();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"chat" | "intake">("chat");
  const [pastHero, setPastHero] = useState(false);
  const [activity, setActivity] = useState<Activity>({ pending: false, hearing: false, success: false, expanded: false });
  const [keyboard, setKeyboard] = useState(0);
  const titleId = useId();

  useEffect(() => {
    if (!home) return;
    const hero = document.getElementById("ops");
    if (!hero) {
      setPastHero(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setPastHero(!entry?.isIntersecting),
      { threshold: 0.2 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [home]);

  useEffect(() => {
    if (home || !cabinet) return;
    const returned = new URLSearchParams(window.location.search).has("avito");
    if (returned) setOpen(true);
  }, [cabinet, home]);

  useEffect(() => {
    if (intakeToken === 0) return;
    setMode("intake");
    setOpen(true);
  }, [intakeToken]);

  useEffect(() => {
    if (openToken === 0) return;
    setMode("chat");
    setOpen(true);
  }, [openToken]);

  useEffect(() => {
    if (fitToken === 0) return;
    setMode("chat");
    setOpen(true);
  }, [fitToken]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    function place() {
      if (!viewport) return;
      const overlap = window.innerHeight - viewport.height - viewport.offsetTop;
      setKeyboard(overlap > 80 ? Math.round(overlap) : 0);
    }
    place();
    viewport.addEventListener("resize", place);
    viewport.addEventListener("scroll", place);
    return () => {
      viewport.removeEventListener("resize", place);
      viewport.removeEventListener("scroll", place);
      setKeyboard(0);
    };
  }, [open]);

  if (cabinet) return null;
  if (home && !pastHero && !open) return null;

  const face: Face = activity.hearing
    ? "listening"
    : activity.pending
      ? "thinking"
      : activity.success
        ? "success"
        : mode === "intake"
          ? "working"
          : "idle";

  return (
    <div
      className={
        open
          ? "pointer-events-none fixed inset-x-2 z-50 sm:inset-x-auto sm:right-6 sm:w-[400px]"
          : "pointer-events-none fixed right-4 bottom-28 z-50 sm:bottom-24"
      }
      style={open ? { bottom: `max(${keyboard + 12}px, env(safe-area-inset-bottom))` } : undefined}
    >
      {open ? (
        <section
          role="region"
          aria-labelledby={titleId}
          data-expanded={mode === "intake" || activity.expanded ? "true" : "false"}
          style={keyboard > 0 ? { maxHeight: `calc(100dvh - ${keyboard + 24}px)` } : undefined}
          className="ops-sheet curator-in pointer-events-auto flex w-full max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[24px] border border-line bg-white shadow-[0_12px_32px_rgba(20,20,20,0.08)]"
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-line bg-white px-4 py-3">
            <span className="size-14 shrink-0">
              <OpsAssistant state={face === "working" ? "working" : face} calm />
            </span>
            <div className="min-w-0">
              <p id={titleId} className="text-sm font-extrabold">
                OPS
              </p>
              <p className="text-xs text-muted">{mode === "intake" ? "Заполняем анкету" : "AI-авитолог AvitoOps"}</p>
            </div>
            {mode === "chat" && activity.hearing ? (
              <span className="grid size-8 place-items-center text-ink/70" aria-hidden="true">
                <WaveIcon live />
              </span>
            ) : null}
            <button
              type="button"
              className="ml-auto grid size-8 place-items-center rounded-full text-ink/70 transition hover:bg-paper hover:text-ink"
              aria-label="Закрыть диалог"
              onClick={() => setOpen(false)}
            >
              <CloseIcon />
            </button>
          </header>
          <div className="flex min-h-0 flex-1 flex-col px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {mode === "intake" ? (
              <div className="ops-thread min-h-0 flex-1 overflow-y-auto">
                <IntakeChat key={intakeToken} />
              </div>
            ) : (
              <CuratorChat
                key={variant}
                variant={variant}
                pageContext={pageContext}
                fitToken={fitToken}
                onActivity={setActivity}
              />
            )}
          </div>
        </section>
      ) : (
        <button
          type="button"
          className="pointer-events-auto flex items-center gap-2 rounded-[20px] border border-line bg-white p-1.5 shadow-[0_8px_24px_rgba(20,20,20,0.08)] transition duration-200 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.98] sm:pr-3.5"
          aria-expanded={false}
          aria-haspopup="true"
          aria-label="Спросить OPS"
          onClick={() => {
            setMode("chat");
            setOpen(true);
          }}
        >
          <span className="size-9 shrink-0">
            <OpsAssistant calm />
          </span>
          <span className="hidden text-sm font-extrabold sm:inline">Спросить OPS</span>
        </button>
      )}
    </div>
  );
}
