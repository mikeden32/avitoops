import Link from "next/link";
import { AgentLine, deskWord } from "@/components/agent-sheet";
import { DeskPulse } from "@/components/desk-board";
import { buttonClass } from "@/components/ui";
import { formatRub } from "@/lib/format";
import { loadStudio } from "@/lib/services/studio";
import { requireClient } from "@/lib/session";
import { keepCopyAction, ownTextAction } from "@/server/studio-actions";

export default async function CopyPage() {
  const user = await requireClient();
  const studio = await loadStudio(user.id);
  const state = studio.desk.marks.copy.state;
  const offer = studio.offer;
  const proposed =
    offer && (offer.action === "publish" || offer.action === "reword" || offer.action === "rename") ? offer.payload : null;
  const title = studio.listing?.title || (typeof proposed?.title === "string" ? proposed.title : "");
  const body = studio.listing?.body || (typeof proposed?.body === "string" ? proposed.body : "");
  const city = studio.listing?.city || (typeof proposed?.city === "string" ? proposed.city : "");
  const price = studio.listing?.priceRub || Number(proposed?.priceRub ?? 0);
  return (
    <main className="grid gap-4">
      <DeskPulse live={state === "work"} />
      <section className="grid gap-4 rounded-[28px] border border-line bg-white p-5">
        <div>
          <h1 className="text-2xl font-extrabold">Копирайтер</h1>
          <p className="text-sm text-muted">{deskWord(state)}</p>
        </div>
        {state === "work" ? <AgentLine>Копирайтер пишет</AgentLine> : null}
        {title ? (
          <div className="grid gap-2">
            <p className="text-xl font-extrabold">{title}</p>
            <p className="text-sm text-muted">
              {city}
              {price ? ` · ${formatRub(price)}` : ""}
            </p>
            <p>{body}</p>
          </div>
        ) : (
          <p className="text-muted">Текст появится, когда ассистент соберёт товар, город и цену.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <form action={keepCopyAction}>
            <button className={buttonClass()}>Оставить</button>
          </form>
          <form action={ownTextAction}>
            <button className={buttonClass("ghost")}>Написать свой</button>
          </form>
        </div>
        <Link href={studio.listing ? `/app/listings/${studio.listing.id}` : "/app/listings/new"} className="text-sm font-semibold">
          Поправить руками
        </Link>
      </section>
    </main>
  );
}
