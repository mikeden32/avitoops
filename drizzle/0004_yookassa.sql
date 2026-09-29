alter table payment_requests add column if not exists provider_payment_id text;
create unique index if not exists payment_requests_provider_payment_id
  on payment_requests (provider_payment_id);
