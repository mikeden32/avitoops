import { Banner, Field, PageTitle, buttonClass } from "@/components/ui";
import { loadSettings } from "@/lib/queries/cabinet";
import { requireClient } from "@/lib/session";
import { contactsAction, resumeServiceAction, stopServiceAction } from "@/server/cabinet-actions";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const user = await requireClient();
  const data = await loadSettings(user.id);
  const params = await searchParams;
  return (
    <main className="grid gap-4">
      <PageTitle title="Настройки" />
      <Banner message={params.error} />
      {params.ok === "avito" ? (
        <p className="text-sm text-good">Авито подключён. Агент начнёт читать новые сообщения.</p>
      ) : params.ok ? (
        <p className="text-sm text-good">Сохранено</p>
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-2">
      <form action={contactsAction} className="grid gap-3 rounded-2xl border border-line bg-card p-4">
        <Field label="Телефон">
          <input name="phone" type="tel" defaultValue={data.phone} required />
        </Field>
        <Field label="Telegram для алертов">
          <input name="telegram" defaultValue={data.telegram} />
        </Field>
        <p className="text-sm text-muted">Телефон входа в Авито: {data.loginHint || "не указан"}</p>
        <p className="text-sm">
          Кабинет Авито:{" "}
          {data.avitoStatus === "connected"
            ? "подключён, помощник читает новые сообщения и отвечает по анкете"
            : "не подключён"}
        </p>
        {data.avitoStatus === "connected" ? null : (
          <div className="grid gap-2">
            <p className="text-sm">Пароль не нужен. Откроется страница Авито.</p>
            <a className={`${buttonClass()} w-fit`} href="/api/avito/connect">
              Подключить Авито
            </a>
          </div>
        )}
        <button className={buttonClass()}>Сохранить контакты</button>
      </form>
      {data.subscriptionStatus === "paused" ? (
        <form action={resumeServiceAction}>
          <button className={buttonClass()}>Возобновить сервис</button>
        </form>
      ) : (
        <form action={stopServiceAction} className="grid gap-3 rounded-2xl border border-line bg-card p-4">
          <label className="flex items-start gap-2 text-sm">
            <input name="confirm" type="checkbox" className="mt-1 w-auto" required />
            Останавливаю публикации и ответы
          </label>
          <button className={buttonClass("danger")}>Остановить сервис</button>
        </form>
      )}
      </div>
    </main>
  );
}
