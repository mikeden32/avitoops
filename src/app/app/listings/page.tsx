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
            <li key={row.id} className="rounded-[20px] border border-line bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xl font-extrabold tracking-tight">{formatRub(row.priceRub)}</p>
                  <Link href={`/app/listings/${row.id}`} className="mt-1 block font-medium">
                    {row.title}
                  </Link>
                  <p className="text-sm text-muted">{row.city}</p>
                </div>
                <span className="rounded-lg bg-paper px-2 py-1 text-xs font-bold">{listingStatusLabel(row.status)}</span>
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
