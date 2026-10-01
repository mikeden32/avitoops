"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark, buttonClass } from "./ui";

type SiteHeaderProps = {
  signedIn: boolean;
  cabinetHref: string;
  signOutAction: () => Promise<void>;
};

function MenuGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-5">
      <path
        d="M4 6h12M4 10h12M4 14h8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function tryOps(onNavigate?: () => void) {
  onNavigate?.();
  const input = document.getElementById("ops-command");
  if (input instanceof HTMLInputElement) {
    input.scrollIntoView({ block: "center" });
    input.focus();
    return;
  }
  window.location.href = "/#ops-command";
}

function ProductLinks({ stacked = false, onNavigate }: { stacked?: boolean; onNavigate?: () => void }) {
  const linkClass = stacked ? "rounded-xl px-3 py-3 hover:bg-paper" : "hover:text-accent";
  return (
    <>
      <Link href="/#how" className={linkClass} onClick={onNavigate}>
        Как работает
      </Link>
      <Link href="/#capabilities" className={linkClass} onClick={onNavigate}>
        Возможности
      </Link>
      <Link href="/tariffs" className={linkClass} onClick={onNavigate}>
        Тарифы
      </Link>
    </>
  );
}

function AccountLinks({
  signedIn,
  cabinetHref,
  signOutAction,
  stacked = false,
  onNavigate,
}: SiteHeaderProps & { stacked?: boolean; onNavigate?: () => void }) {
  const linkClass = stacked ? "rounded-xl px-3 py-3 hover:bg-paper" : "hover:text-accent";
  if (signedIn) {
    return (
      <>
        <Link href={cabinetHref} className={linkClass} onClick={onNavigate}>
          Кабинет
        </Link>
        <form action={signOutAction} className={stacked ? "mt-2" : undefined}>
          <button className={stacked ? `${buttonClass("ghost")} w-full` : buttonClass("ghost")}>Выйти</button>
        </form>
      </>
    );
  }
  return (
    <>
      <Link href="/login" className={linkClass} onClick={onNavigate}>
        Войти
      </Link>
      <button
        type="button"
        className={stacked ? `${buttonClass()} mt-2 w-full` : buttonClass()}
        onClick={() => tryOps(onNavigate)}
      >
        Попробовать OPS
      </button>
    </>
  );
}

export function SiteHeader({ signedIn, cabinetHref, signOutAction }: SiteHeaderProps) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 12);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    function onChange() {
      if (media.matches) setOpen(false);
    }
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const account = { signedIn, cabinetHref, signOutAction };

  return (
    <>
      <header
        className={`sticky top-0 z-30 transition duration-300 ${
          scrolled ? "border-b border-line bg-white/85 backdrop-blur" : "border-b border-transparent bg-white/80"
        }`}
      >
        <div className="hero-shell flex items-center justify-between gap-3 py-3">
          <Link href="/" className="shrink-0">
            <Wordmark className="text-2xl md:text-[28px]" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-ink md:flex">
            <ProductLinks />
          </nav>
          <div className="hidden items-center gap-3 text-sm font-semibold md:flex">
            <AccountLinks {...account} />
          </div>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-xl text-ink hover:bg-paper md:hidden"
            aria-label="Открыть меню"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <MenuGlyph />
          </button>
        </div>
      </header>
      {open ? (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button type="button" className="absolute inset-0 bg-ink/30" aria-label="Закрыть меню" onClick={() => setOpen(false)} />
          <nav
            className="drawer-in absolute inset-y-0 left-0 flex w-[min(18rem,calc(100vw-3rem))] flex-col gap-1 overflow-y-auto bg-white p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[8px_0_28px_rgba(20,20,20,0.16)]"
            aria-label="Меню"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <Wordmark className="text-2xl" />
              <button
                type="button"
                className="rounded-xl px-3 py-2 text-sm font-bold text-muted hover:bg-paper hover:text-ink"
                onClick={() => setOpen(false)}
              >
                Закрыть
              </button>
            </div>
            <div className="grid text-base font-semibold text-ink">
              <ProductLinks stacked onNavigate={() => setOpen(false)} />
              <AccountLinks {...account} stacked onNavigate={() => setOpen(false)} />
            </div>
          </nav>
        </div>
      ) : null}
    </>
  );
}
