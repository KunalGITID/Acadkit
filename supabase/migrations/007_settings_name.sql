-- Display name for greetings ("Good morning, Kunal").
-- Optional: the app falls back to a device-local name if this column
-- is missing, but adding it makes the name follow your PIN everywhere.
alter table settings add column if not exists name text;
