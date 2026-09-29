import { notFound } from "next/navigation";
import { Banner, Field, PageTitle, buttonClass } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { loadClient } from "@/lib/queries/admin";
import {
  accessAction,
  avitoAction,
  cancelClientAction,
  digestAction,
  manualJobAction,
  pauseClientAction,
  resumeClientAction,
} from "@/server/admin-actions";

export default async function AdminClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const client = await loadClient(id);
  if (!client) notFound();
  return (
    <main className="grid gap-4">
      <PageTitle title={client.email} text={`${client.plan ?? "без тарифа"} · до ${formatDate(client.periodEnd)}`} />
      <Banner message={query.error} />
      <section className="grid gap-2 rounded-2xl border border-line bg-card p-4 text-sm">
        <p>Телефон: {client.phone || "—"}</p>
        <p>Telegram: {client.telegram || "—"}</p>
        <p>Телефон Авито: {client.loginHint || "—"}</p>
        <p>Подписка: {client.subscriptionStatus ?? "нет"}</p>
        <div className="flex flex-wrap gap-2">
          <form action={pauseClientAction}>
            <input type="hidden" name="userId" value={client.id} />
            <button className={buttonClass("danger")}>Пауза клиента</button>
          </form>
          <form action={resumeClientAction}>
            <input type="hidden" name="userId" value={client.id} />
            <button className={buttonClass("ghost")}>Снять паузу</button>
          </form>
          <form action={cancelClientAction}>
            <input type="hidden" name="userId" value={client.id} />
            <button className={buttonClass("ghost")}>Отменить подписку</button>
          </form>
        </div>
      </section>
      <form action={accessAction} className="grid gap-3 rounded-2xl border border-line bg-card p-4">
        <input type="hidden" name="userId" value={client.id} />
        <Field label="Доступ">
          <select name="state" defaultValue={client.access}>
            <option value="green">green — в порядке</option>
            <option value="yellow">yellow — пауза</option>
            <option value="red">red — пауза</option>
          </select>
        </Field>
        <Field label="Причина" hint="Для клиента причина не показывается">
          <input name="reason" defaultValue={client.accessReason} placeholder="429" />
        </Field>
        <button className={buttonClass()}>Сохранить доступ</button>
      </form>
      <form action={avitoAction} className="grid gap-3 rounded-2xl border border-line bg-card p-4">
        <input type="hidden" name="userId" value={client.id} />
        <Field label="Статус Авито">
          <select name="status" defaultValue={client.avitoStatus}>
            <option value="pending">pending</option>
            <option value="connected">connected</option>
            <option value="blocked">blocked</option>
          </select>
        </Field>
        <Field label="Заметки оператора">
          <textarea name="notes" defaultValue={client.avitoNotes} />
        </Field>
        <button className={buttonClass("ghost")}>Сохранить Авито</button>
      </form>
      <form action={manualJobAction} className="grid gap-3 rounded-2xl border border-line bg-card p-4">
        <input type="hidden" name="userId" value={client.id} />
        <Field label="Тип задачи">
          <select name="type" defaultValue="publish">
            <option value="publish">publish</option>
            <option value="update">update</option>
            <option value="reply">reply</option>
            <option value="promo">promo</option>
            <option value="report">report</option>
            <option value="heal_access">heal_access</option>
          </select>
        </Field>
        <Field label="Объявление">
          <select name="listingId">
            <option value="">—</option>
            {client.listings.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} ({item.status})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Payload JSON">
          <textarea name="payload" defaultValue="{}" />
        </Field>
        <button className={buttonClass()}>Создать задачу</button>
      </form>
      <form action={digestAction} className="grid gap-3 rounded-2xl border border-line bg-card p-4">
        <input type="hidden" name="userId" value={client.id} />
        <Field label="Лид">
          <textarea name="preview" required />
        </Field>
        <Field label="Срочность">
          <select name="urgency" defaultValue="normal">
            <option value="normal">normal</option>
            <option value="hot">hot</option>
          </select>
        </Field>
        <Field label="Объявление">
          <select name="listingId">
            <option value="">—</option>
            {client.listings.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </Field>
        <button className={buttonClass("ghost")}>Добавить лид</button>
      </form>
    </main>
  );
}
