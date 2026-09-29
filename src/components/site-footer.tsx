import Link from "next/link";

export function SiteFooter() {
  const email = process.env.CONTACT_EMAIL ?? "hello@avitoops.local";
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>AvitoOps</p>
        <nav className="flex flex-wrap gap-4">
          <Link href="/offer">Оферта</Link>
          <Link href="/consent">Согласие на обработку данных</Link>
          <a href={`mailto:${email}`}>{email}</a>
        </nav>
      </div>
    </footer>
  );
}
