import Link from "next/link";
import { Empty, PageTitle, buttonClass } from "@/components/ui";
import { formatRub, listingStatusLabel } from "@/lib/format";
import { loadListings } from "@/lib/queries/cabinet";
import { requireClient } from "@/lib/session";

export default async function ListingsPage() {
  const user = await requireClient();
  const rows = await loadListings(user.id);
  return (
    <main className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <PageTitle title="Объявления" />
        <Link href="/app/listings/new" className={buttonClass()}>
          Создать
        </Link>
      </div>
      {rows.length === 0 ? (
        <Empty>Черновиков пока нет.</Empty>
      ) : (
        <ul className="grid gap-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl border border-line bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link href={`/app/listings/${row.id}`} className="font-semibold">
                    {row.title}
                  </Link>
                  <p className="text-sm text-muted">
                    {row.city} · {formatRub(row.priceRub)}
                  </p>
                </div>
                <span className="text-sm">{listingStatusLabel(row.status)}</span>
              </div>
              {row.avitoUrl ? (
                <a className="mt-2 block text-sm text-accent" href={row.avitoUrl}>
                  Открыть на Авито
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
