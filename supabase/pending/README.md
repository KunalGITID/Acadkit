# Pending migrations

SQL that is finished but **must not run yet**, kept out of
`supabase/migrations/` so `supabase db push` cannot apply it by accident.

Empty right now. 015 lived here while the auth cutover was staged — it
had to run *after* a PIN was claimed, or it would have locked the owner
out of their own data — and moved into `migrations/` once applied.
