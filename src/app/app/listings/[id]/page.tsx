import { notFound } from "next/navigation";
import { ListingForm } from "@/components/listing-form";
import { PageTitle } from "@/components/ui";
import { formatDateTime, formatRub, jobStatusLabel, listingStatusLabel } from "@/lib/format";
import { loadListing } from "@/lib/queries/cabinet";
import { requireClient } from "@/lib/session";
import { movePhotoAction, updateListingAction } from "@/server/cabinet-actions";

export default async function ListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const user = await requireClient();
  const { id } = await params;
  const query = await searchParams;
  const data = await loadListing(user.id, id);
  if (!data) notFound();
  const { listing, history } = data;
  return (
    <main className="grid gap-4">
      <PageTitle title={listing.title} text={listingStatusLabel(listing.status)} />
      {listing.avitoUrl ? (
        <a className="text-sm text-accent" href={listing.avitoUrl}>
          {listing.avitoUrl}
        </a>
      ) : null}
      {query.ok ? <p className="text-sm text-good">Сохранено</p> : null}
      <article className="overflow-hidden rounded-[20px] border border-line bg-card">
        {listing.photos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            src={`/api/photos/${user.id}/${listing.id}/${listing.photos[0]}`}
            className="h-56 w-full object-cover"
          />
        ) : (
          <p className="px-4 pt-4 text-sm text-muted">Фото ещё нет</p>
        )}
        <div className="grid gap-1 p-4">
          <p className="text-xl font-extrabold">{listing.title}</p>
          <p>
            {formatRub(listing.priceRub)} · {listing.city}
          </p>
          <p className="text-sm text-muted">{listing.body}</p>
        </div>
      </article>
      <ul className="grid gap-2">
        {listing.photos.map((photo) => (
          <li key={photo} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-card p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              src={`/api/photos/${user.id}/${listing.id}/${photo}`}
              className="h-16 w-16 rounded-lg object-cover"
            />
            <form action={movePhotoAction} className="flex gap-2">
              <input type="hidden" name="listingId" value={listing.id} />
              <input type="hidden" name="filename" value={photo} />
              <button name="dir" value="up" className="text-sm">
                Вверх
              </button>
              <button name="dir" value="down" className="text-sm">
                Вниз
              </button>
            </form>
          </li>
        ))}
      </ul>
      <ListingForm action={updateListingAction} listing={listing} error={query.error} />
      <section className="grid gap-2">
        <h2 className="font-semibold">История задач</h2>
        {history.length === 0 ? <p className="text-sm text-muted">Задач ещё не было.</p> : null}
        <ul className="grid gap-2 text-sm">
          {history.map((item) => (
            <li key={item.id} className="rounded-xl border border-line bg-card px-3 py-2">
              {item.type} · {jobStatusLabel(item.status)} · {formatDateTime(item.createdAt)}
              {item.errorCode ? ` · ${item.errorCode}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
