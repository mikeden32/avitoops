import { Banner, Field, PageTitle, buttonClass } from "@/components/ui";
import { loadClients, loadSlots } from "@/lib/queries/admin";
import { assignSlotAction, createSlotAction, unassignSlotAction } from "@/server/admin-actions";

export default async function ProxiesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const [slots, clients] = await Promise.all([loadSlots(), loadClients()]);
  return (
    <main className="grid gap-4">
      <PageTitle title="Прокси-слоты" text="В кабинете клиента этих данных нет. Здесь только ссылка на секрет, не сам пароль." />
      <Banner message={params.error} />
      <form action={createSlotAction} className="grid gap-3 rounded-2xl border border-line bg-card p-4 md:grid-cols-2">
        <Field label="Провайдер">
          <select name="provider" defaultValue="ltespace">
            <option value="ltespace">ltespace</option>
            <option value="ltecenter">ltecenter</option>
            <option value="other">other</option>
          </select>
        </Field>
        <Field label="Название">
          <input name="label" required />
        </Field>
        <Field label="Регион">
          <input name="region" />
        </Field>
        <Field label="Оператор">
          <input name="operator" />
        </Field>
        <Field label="secret_ref">
          <input name="secretRef" required placeholder="vault://slot/1" />
        </Field>
        <div className="flex items-end">
          <button className={buttonClass()}>Добавить слот</button>
        </div>
      </form>
      <ul className="grid gap-3">
        {slots.map((slot) => (
          <li key={slot.id} className="grid gap-2 rounded-2xl border border-line bg-card p-4 text-sm">
            <p className="font-medium">
              {slot.label} · {slot.provider} · {slot.status}
            </p>
            <p className="text-muted">
              {slot.region || "регион не указан"} · {slot.operator || "оператор не указан"} · {slot.email || "не назначен"}
            </p>
            <p>secret_ref: {slot.secretRef}</p>
            <div className="flex flex-wrap gap-2">
              {slot.status === "free" ? (
                <form action={assignSlotAction} className="flex flex-wrap gap-2">
                  <input type="hidden" name="slotId" value={slot.id} />
                  <select name="userId" className="w-auto" required>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.email}
                      </option>
                    ))}
                  </select>
                  <button className={buttonClass()}>Назначить</button>
                </form>
              ) : null}
              {slot.assignedUserId ? (
                <form action={unassignSlotAction}>
                  <input type="hidden" name="slotId" value={slot.id} />
                  <button className={buttonClass("ghost")}>Снять</button>
                </form>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
