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
    <nav className="flex gap-2 overflow-x-auto border-b border-line pb-3 text-sm">
      {links.map(([href, label]) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`shrink-0 rounded-full px-3 py-1 ${active ? "bg-ink text-white" : "bg-card"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
