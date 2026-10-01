"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { deskWord } from "@/components/agent-sheet";
import { buttonClass } from "@/components/ui";
import type { DeskRoleName } from "@/lib/services/desk";
import { finishFrameAction, finishReplyAction } from "@/server/studio-actions";

const tiles: Array<[DeskRoleName, string, string]> = [
  ["copy", "Копирайтер", "/app/copy"],
  ["design", "Дизайнер", "/app/design"],
  ["promo", "Менеджер продвижения", "/app/promo"],
  ["reply", "Менеджер переписки", "/app/reply"],
];

export function DeskTiles({
  marks,
}: {
  marks: Record<DeskRoleName, { state: "wait" | "work" | "done" }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      {tiles.map(([role, name, href]) => (
        <Link key={role} href={href} className="rounded-[20px] border border-line bg-card px-4 py-4">
          <p className="font-extrabold">{name}</p>
          <p className="mt-1 text-sm text-muted">
            {role === "design" && marks[role].state === "work" ? "Дизайнер работает" : deskWord(marks[role].state)}
          </p>
        </Link>
      ))}
    </div>
  );
}

export function DeskPulse({ live }: { live: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(id);
  }, [live, router]);
  return null;
}

export function FrameRunner({ run }: { run: boolean }) {
  const started = useRef(false);
  useEffect(() => {
    if (!run || started.current) return;
    started.current = true;
    void finishFrameAction();
  }, [run]);
  return null;
}

export function ReplyRunner({ run }: { run: boolean }) {
  const started = useRef(false);
  useEffect(() => {
    if (!run || started.current) return;
    started.current = true;
    void finishReplyAction();
  }, [run]);
  return null;
}

export function OwnPhotoForm({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  return (
    <form action={action}>
      <label className={`${buttonClass("ghost")} cursor-pointer`}>
        Пришлю своё
        <input
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(event) => {
            if (event.currentTarget.files?.length) event.currentTarget.form?.requestSubmit();
          }}
        />
      </label>
    </form>
  );
}

export function CabinetLinks() {
  const links = [
    ["/app/listings", "Все объявления"],
    ["/app/onboarding", "Анкета"],
    ["/app/leads", "Лиды"],
    ["/app/billing", "Биллинг"],
    ["/app/settings", "Настройки"],
  ];
  return (
    <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {links.map(([href, label]) => (
        <Link key={href} href={href} className="font-semibold text-muted">
          {label}
        </Link>
      ))}
    </nav>
  );
}
