import Link from "next/link";
import { Wordmark } from "./ui";

export function SiteFooter() {
  const email = process.env.CONTACT_EMAIL ?? "hello@avitoops.local";
  return (
    <footer className="mt-16 border-t border-line bg-white">
      <div className="shell flex flex-col gap-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <Wordmark className="text-xl" />
        <nav className="flex flex-wrap gap-4">
          <Link href="/offer" className="hover:text-ink">
            Оферта
          </Link>
          <Link href="/contacts" className="hover:text-ink">
            Контакты и реквизиты
          </Link>
          <Link href="/consent" className="hover:text-ink">
            Согласие на обработку данных
          </Link>
          <a href={`mailto:${email}`} className="hover:text-ink">
            {email}
          </a>
        </nav>
      </div>
    </footer>
  );
}
