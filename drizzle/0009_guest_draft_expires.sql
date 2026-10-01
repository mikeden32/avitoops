-- Speeds cleanup of expired guest drafts. App rollback can leave the index.
-- Index rollback, only if it must be undone: drop index if exists guest_drafts_status_expires_idx;

create index if not exists guest_drafts_status_expires_idx on guest_drafts (status, expires_at);
