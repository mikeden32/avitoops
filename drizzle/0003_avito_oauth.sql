alter table avito_accounts add column if not exists avito_user_id text;
alter table avito_accounts add column if not exists refresh_token text;
alter table messages_digest add column if not exists external_ref text;
create unique index if not exists messages_digest_user_external_ref
  on messages_digest (user_id, external_ref);
