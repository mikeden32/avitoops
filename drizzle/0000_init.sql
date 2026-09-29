create extension if not exists citext;
create extension if not exists pgcrypto;

create type user_role as enum ('client', 'admin');
create type sub_plan as enum ('start', 'business');
create type sub_status as enum ('active', 'past_due', 'paused', 'canceled');
create type avito_status as enum ('pending', 'connected', 'blocked');
create type proxy_provider as enum ('ltespace', 'ltecenter', 'other');
create type proxy_status as enum ('free', 'assigned', 'banned', 'dead');
create type listing_status as enum ('draft', 'queued', 'publishing', 'live', 'error', 'paused');
create type job_type as enum ('publish', 'update', 'reply', 'promo', 'report', 'heal_access');
create type job_status as enum ('queued', 'running', 'done', 'failed', 'canceled');
create type lead_urgency as enum ('hot', 'normal');
create type lead_status as enum ('new', 'handled', 'escalated_to_client');
create type ledger_kind as enum ('subscription', 'deposit', 'promo_spend', 'refund');
create type work_mode as enum ('own_cabinet', 'materials_only');
create type payment_kind as enum ('subscription', 'deposit');
create type payment_status as enum ('pending', 'paid', 'rejected');
create type notify_channel as enum ('email', 'telegram', 'operator');
create type notify_status as enum ('pending', 'sent');

create table users (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique,
  phone         text,
  telegram      text,
  role          user_role not null default 'client',
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references users(id),
  plan                  sub_plan not null,
  status                sub_status not null default 'active',
  current_period_end    timestamptz not null,
  payment_provider      text,
  payment_provider_id   text,
  created_at            timestamptz not null default now(),
  unique (user_id)
);

create table avito_accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id),
  login_hint  text,
  status      avito_status not null default 'pending',
  notes       text,
  created_at  timestamptz not null default now(),
  unique (user_id)
);

create table proxy_slots (
  id               uuid primary key default gen_random_uuid(),
  provider         proxy_provider not null,
  label            text not null,
  region           text,
  operator         text,
  status           proxy_status not null default 'free',
  assigned_user_id uuid references users(id),
  secret_ref       text not null,
  created_at       timestamptz not null default now()
);

create table listings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id),
  title           text not null,
  category        text not null,
  city            text not null,
  price_rub       integer not null check (price_rub >= 0),
  body            text not null,
  photos          jsonb not null default '[]',
  avito_url       text,
  external_id     text,
  status          listing_status not null default 'draft',
  error_note      text,
  sku             text,
  delivery_note   text,
  kit_note        text,
  operator_notes  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index listings_user_status_idx on listings(user_id, status);

create table jobs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id),
  listing_id     uuid references listings(id),
  type           job_type not null,
  payload        jsonb not null default '{}',
  status         job_status not null default 'queued',
  assigned_agent text,
  created_by     text not null default 'system',
  error_code     text,
  error_note     text,
  created_at     timestamptz not null default now(),
  started_at     timestamptz,
  finished_at    timestamptz
);
create index jobs_status_created_idx on jobs(status, created_at);

create table messages_digest (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id),
  listing_id  uuid references listings(id),
  preview     text not null,
  urgency     lead_urgency not null default 'normal',
  status      lead_status not null default 'new',
  created_at  timestamptz not null default now()
);
create index messages_digest_user_idx on messages_digest(user_id, created_at desc);

create table promo_budgets (
  user_id        uuid primary key references users(id),
  week_limit_rub integer not null default 0 check (week_limit_rub >= 0),
  spent_rub      integer not null default 0 check (spent_rub >= 0),
  enabled        boolean not null default false,
  week_start     date not null
);

create table ledger (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id),
  kind        ledger_kind not null,
  amount_rub  integer not null check (amount_rub > 0),
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index ledger_user_idx on ledger(user_id, created_at desc);

create table access_status (
  user_id     uuid primary key references users(id),
  state       text not null check (state in ('green', 'yellow', 'red')),
  reason      text,
  updated_at  timestamptz not null default now()
);

create table client_profiles (
  user_id         uuid primary key references users(id),
  company_name    text not null,
  phone           text not null,
  telegram        text,
  work_mode       work_mode not null,
  cities          text[] not null default '{}',
  categories      text[] not null default '{}',
  reply_rules     text,
  escalate_rules  text,
  consent_at      timestamptz not null,
  created_at      timestamptz not null default now()
);

create table payment_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id),
  kind         payment_kind not null,
  plan         sub_plan,
  amount_rub   integer not null check (amount_rub > 0),
  status       payment_status not null default 'pending',
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  text
);
create index payment_requests_status_idx on payment_requests(status, created_at);

create table audit_events (
  id          uuid primary key default gen_random_uuid(),
  actor       text not null,
  action      text not null,
  entity      text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index audit_events_entity_idx on audit_events(entity, entity_id, created_at desc);

create table notification_outbox (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id),
  channel     notify_channel not null,
  kind        text not null,
  payload     jsonb not null default '{}',
  status      notify_status not null default 'pending',
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index notification_outbox_status_idx on notification_outbox(status, created_at);
