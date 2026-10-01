"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buttonClass } from "./ui";

const STORAGE_KEY = "avitoops-cookie-consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  function accept() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* private mode */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card px-4 py-3 shadow-[0_-8px_24px_rgba(20,20,20,0.08)]">
      <div className="shell flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm">
        Мы используем cookie, чтобы после входа вы оставались в кабинете. Рекламных cookie нет.{" "}
        <Link href="/consent#cookies" className="font-semibold text-ink underline">
          Подробнее
        </Link>
      </p>
      <button type="button" className={buttonClass()} onClick={accept}>
        Согласен
      </button>
      </div>
    </div>
  );
}
