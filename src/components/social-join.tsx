"use client";

import { useTransition } from "react";
import { socialJoinAction } from "@/server/auth-actions";

export function SocialJoin({
  plan,
  title = "Или присоединитесь с помощью",
  from,
  providers,
}: {
  plan: string;
  title?: string;
  from?: "login";
  providers: ReadonlyArray<{ id: string; label: string; src: string; fit: string }>;
}) {
  const [pending, startTransition] = useTransition();

  function join(provider: string) {
    const selected =
      from === "login" ? plan : document.querySelector<HTMLSelectElement>('select[name="plan"]')?.value || plan;
    const data = new FormData();
    data.set("provider", provider);
    data.set("plan", selected);
    if (from) data.set("from", from);
    startTransition(() => {
      void socialJoinAction(data);
    });
  }

  if (providers.length === 0) return null;

  return (
    <div className="rounded-[20px] border border-line bg-card px-5 py-6">
      <p className="text-center text-[15px] text-muted">{title}</p>
      <div className="mx-auto mt-4 grid w-max max-w-full grid-cols-3 gap-3 sm:grid-cols-6">
        {providers.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            disabled={pending}
            onClick={() => join(item.id)}
            className={`grid size-12 shrink-0 place-items-center overflow-hidden rounded-[14px] transition duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0084c7] disabled:translate-y-0 disabled:opacity-60 ${
              item.fit === "glyph" ? "bg-white shadow-[0_0_0_1px_#e5e4e2]" : "shadow-[0_1px_2px_rgba(20,20,20,0.08)]"
            }`}
          >
            <img
              src={item.src}
              alt=""
              className={
                item.fit === "glyph"
                  ? "size-7 object-contain"
                  : item.fit === "fill"
                    ? "size-full origin-center scale-[1.2]"
                    : "size-full object-cover"
              }
            />
          </button>
        ))}
      </div>
    </div>
  );
}
