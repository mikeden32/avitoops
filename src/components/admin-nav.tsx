"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["/admin", "Клиенты"],
  ["/admin/jobs", "Задачи"],
  ["/admin/proxies", "Слоты"],
  ["/admin/payments", "Оплаты"],
  ["/admin/notifications", "Уведомления"],
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-2 overflow-x-auto text-sm">
      {links.map(([href, label]) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`shrink-0 rounded-xl px-4 py-2 font-semibold ${active ? "bg-ink text-white" : "bg-card text-ink"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
