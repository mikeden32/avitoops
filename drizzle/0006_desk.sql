alter table users add column cabinet_consent_at timestamptz;

create table desk_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  listing_id uuid references listings (id),
  role text not null,
  status text not null default 'queued',
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table curator_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  action text not null,
  payload jsonb not null default '{}',
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table curator_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);
