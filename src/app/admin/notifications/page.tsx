import { PageTitle, buttonClass } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { loadNotifications } from "@/lib/queries/admin";
import { dispatchAction } from "@/server/admin-actions";

export default async function NotificationsPage() {
  const rows = await loadNotifications();
  return (
    <main className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle title="Уведомления" text="Письмо и Telegram уходят, только если заданы SMTP или токен бота." />
        <form action={dispatchAction}>
          <button className={buttonClass()}>Повторить отправку</button>
        </form>
      </div>
      <ul className="grid gap-2 text-sm">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-line bg-card px-3 py-2">
            {row.kind} · {row.channel} · {row.status} · {formatDateTime(row.createdAt)}
          </li>
        ))}
      </ul>
    </main>
  );
}
