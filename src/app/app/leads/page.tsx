import { Banner, Empty, PageTitle, buttonClass } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { loadLeads } from "@/lib/queries/cabinet";
import { requireClient } from "@/lib/session";
import { escalateAction, replyAction } from "@/server/cabinet-actions";

const statusText: Record<string, string> = {
  new: "Новый",
  handled: "В работе у команды",
  escalated_to_client: "Передан вам",
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const user = await requireClient();
  const rows = await loadLeads(user.id);
  const params = await searchParams;
  return (
    <main className="grid gap-4">
      <PageTitle title="Лиды" text="Короткий дайджест, без полной переписки Авито." />
      <Banner message={params.error} />
      {params.ok ? <p className="text-sm text-good">Шаблон ответа поставлен в очередь.</p> : null}
      {rows.length === 0 ? <Empty>Новых сообщений пока нет.</Empty> : null}
      <ul className="grid gap-3">
        {rows.map((row) => (
          <li key={row.id} className="grid gap-2 rounded-2xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className={row.urgency === "hot" ? "font-semibold text-bad" : "text-muted"}>
                {row.urgency === "hot" ? "Горячий" : "Обычный"}
              </span>
              <span>{statusText[row.status] ?? row.status}</span>
            </div>
            <p>{row.preview}</p>
            <p className="text-xs text-muted">
              {row.listingTitle ?? "Без объявления"} · {formatDateTime(row.createdAt)}
            </p>
            {row.status === "new" ? (
              <div className="flex flex-wrap gap-2">
                <form action={replyAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <button className={buttonClass()}>Шаблон ответа</button>
                </form>
                <form action={escalateAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <button className={buttonClass("ghost")}>Передать мне</button>
                </form>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
