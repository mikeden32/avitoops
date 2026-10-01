-- Guest task before an account exists. The browser keeps only an opaque token.
-- Additive. Rolling the app back leaves this table in place.
-- Dropping guest_drafts is not a rollback once it holds real drafts.
-- Delete the table only in a later migration, after the rows have been checked.

create table guest_drafts (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  status text not null default 'active',
  product text,
  location text,
  price integer,
  title text,
  description text,
  attributes jsonb not null default '{}'::jsonb,
  visible_transcript jsonb not null default '[]'::jsonb,
  missing_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_by_user_id uuid references users (id) on delete cascade,
  claimed_listing_id uuid references listings (id) on delete set null,
  constraint guest_drafts_status_check check (status in ('active', 'claimed'))
);

create unique index guest_drafts_token_hash_unique on guest_drafts (token_hash);
create index guest_drafts_claimed_by_user_id_idx on guest_drafts (claimed_by_user_id);
