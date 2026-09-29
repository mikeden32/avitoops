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
    <div className="fixed bottom-20 left-4 z-40 w-[min(100vw-2rem,26rem)] rounded-[20px] border border-line bg-card p-4 shadow-[0_16px_40px_rgba(20,20,20,0.16)]">
      <p className="text-sm">
        Мы используем cookie, чтобы после входа вы оставались в кабинете. Рекламных cookie нет.{" "}
        <Link href="/consent#cookies" className="font-semibold text-ink underline">
          Подробнее
        </Link>
      </p>
      <button type="button" className={`${buttonClass()} mt-3`} onClick={accept}>
        Согласен
      </button>
    </div>
  );
}
