# AvitoOps

Кабинет ведения объявлений на Авито: витрина, подписка с ручным подтверждением оплаты, объявления, очередь задач и админка. Боты в этот репозиторий не входят: они забирают задачи внутренним ключом.

## Локальный запуск

1. `npm install`
2. Скопируйте `.env.example` в `.env` и задайте секреты. Для локальной базы подойдёт уже подготовленный `.env`.
3. `npm run db:up` — встроенный PostgreSQL на порту 54329. Кластер лежит в `%USERPROFILE%\.avitoops\pg`. Окно не закрывать.
4. `npm run db:migrate`
5. `npm run db:seed` — создаёт админа из `ADMIN_EMAIL` / `ADMIN_PASSWORD`, если его ещё нет.
6. `npm run dev` и откройте http://localhost:3000

Локальный админ берётся из `.env`: `ADMIN_EMAIL` и `ADMIN_PASSWORD`. Пароль в репозиторий не кладём.

## Оплата пилота

Клиент создаёт заявку на тариф или депозит. Оператор в разделе «Оплаты» нажимает «Оплачено». Контракт провайдера — `src/lib/billing-provider.ts`, сейчас это ручной режим. ЮKassa подключается тем же подтверждением заявки.

## Контракт бота

```bash
curl -X POST http://localhost:3000/api/internal/jobs/next \
  -H "Authorization: Bearer %INTERNAL_API_KEY%" \
  -H "Content-Type: application/json" \
  -d "{\"agent\":\"avitolog-1\"}"
```

```bash
curl -X POST http://localhost:3000/api/internal/jobs/JOB_ID/complete \
  -H "Authorization: Bearer %INTERNAL_API_KEY%" \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"done\",\"avito_url\":\"https://www.avito.ru/...\",\"external_id\":\"123\"}"
```

Входящий лид:

```bash
curl -X POST http://localhost:3000/api/internal/digest \
  -H "Authorization: Bearer %INTERNAL_API_KEY%" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\":\"...\",\"preview\":\"Торг от 10 шт\",\"urgency\":\"hot\"}"
```

Сайт не отдаёт host, port и логин прокси. В админке хранится только `secret_ref` на vault.

## Бэкап

Раз в сутки: `npm run backup` при установленном `pg_dump` и переменной `DATABASE_URL`. Файл появляется в `backups/`.

## Проверка

`npm run accept` прогоняет сценарий пилота по базе: лимит тарифа, публикация до live, пауза доступа, депозит, слот прокси.
