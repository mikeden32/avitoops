import Link from "next/link";
import { Wordmark } from "./ui";

export function SiteFooter() {
  const raw = process.env.CONTACT_EMAIL?.trim() ?? "";
  const email = raw && !raw.toLowerCase().endsWith(".local") ? raw : "";
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-white">
      <div className="shell grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid content-start gap-3">
          <Wordmark className="text-xl" />
          <p className="text-sm text-muted">AI-помощник для работы с объявлениями</p>
          <p className="text-sm text-muted">© {year} AvitoOps</p>
          {email ? (
            <a href={`mailto:${email}`} className="text-sm text-muted hover:text-ink">
              {email}
            </a>
          ) : null}
        </div>
        <nav className="grid content-start gap-2 text-sm" aria-label="Продукт">
          <p className="font-extrabold text-ink">Продукт</p>
          <Link href="/#how" className="text-muted hover:text-ink">
            Как работает
          </Link>
          <Link href="/#capabilities" className="text-muted hover:text-ink">
            Возможности
          </Link>
          <Link href="/tariffs" className="text-muted hover:text-ink">
            Тарифы
          </Link>
        </nav>
        <nav className="grid content-start gap-2 text-sm" aria-label="Аккаунт">
          <p className="font-extrabold text-ink">Аккаунт</p>
          <Link href="/login" className="text-muted hover:text-ink">
            Войти
          </Link>
          <Link href="/register" className="text-muted hover:text-ink">
            Подключить
          </Link>
        </nav>
        <nav className="grid content-start gap-2 text-sm" aria-label="Документы">
          <p className="font-extrabold text-ink">Документы</p>
          <Link href="/offer" className="text-muted hover:text-ink">
            Оферта
          </Link>
          <Link href="/contacts" className="text-muted hover:text-ink">
            Контакты и реквизиты
          </Link>
          <Link href="/consent" className="text-muted hover:text-ink">
            Согласие на обработку данных
          </Link>
        </nav>
      </div>
    </footer>
  );
}
