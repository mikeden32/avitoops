alter table notification_outbox add column if not exists attempt_at timestamptz;
