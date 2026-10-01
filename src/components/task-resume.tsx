export function TaskResume({
  error,
  note,
  title,
  listingId,
  celebrate,
  hasProfile,
  avitoConnected,
}: {
  error?: string | null;
  note?: string | null;
  title?: string | null;
  listingId?: string | null;
  celebrate: boolean;
  hasProfile: boolean;
  avitoConnected: boolean;
}) {
  if (error) {
    return (
      <p role="alert" className="rounded-[20px] border border-bad/30 bg-card px-4 py-3 text-sm">
        {error}
      </p>
    );
  }
  if (!listingId) {
    if (!note) return null;
    return <p className="rounded-[20px] border border-line bg-card px-4 py-3 text-sm">{note}</p>;
  }
  if (hasProfile && avitoConnected && !celebrate) return null;
  const next = !hasProfile ? "setup" : !avitoConnected ? "connect" : "go";
  return (
    <section className="rounded-[20px] border border-line bg-card p-4">
      <h2 className="text-xl font-extrabold tracking-tight">
        {celebrate
          ? "Готово. Я сохранил объявление. Теперь настроим только то, что нужно для работы."
          : "Объявление на месте. Продолжим настройку."}
      </h2>
      {title ? <p className="mt-2 text-sm text-muted">{title}</p> : null}
      <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-4">
        <li className="rounded-xl bg-paper px-3 py-2 font-semibold">Аккаунт</li>
        <li className="rounded-xl bg-paper px-3 py-2">
          {next === "setup" ? (
            <a className="font-semibold" href="/app/onboarding">
              Настройка
            </a>
          ) : (
            "Настройка"
          )}
        </li>
        <li className="rounded-xl bg-paper px-3 py-2">
          {next === "connect" ? (
            <a className="font-semibold" href="/api/avito/connect">
              Подключение
            </a>
          ) : (
            "Подключение"
          )}
        </li>
        <li className="rounded-xl bg-paper px-3 py-2">
          <a className={next === "go" ? "font-semibold" : undefined} href={`/app/listings/${listingId}`}>
            Запуск
          </a>
        </li>
      </ol>
    </section>
  );
}
