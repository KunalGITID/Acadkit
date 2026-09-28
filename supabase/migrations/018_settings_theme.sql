-- Theme follows the account, not the device.
--
-- Everything else in AcadKit syncs: subjects, marks, attendance, the
-- semester window. The theme did not — it lived only in localStorage, so
-- signing in on a second device dropped you back on the default and you
-- re-picked it every time. It is also the setting people feel most
-- strongly about, which made it the worst one to lose.
--
-- Nullable with no default on purpose: null means "this account has never
-- expressed a preference", which is what lets a device publish its local
-- choice on first load instead of being overwritten by a server default
-- it never chose.
--
-- Deliberately unconstrained. A CHECK listing the theme names would have
-- to be migrated every time one is added or retired, and forgetting would
-- fail the write rather than the deploy. The app already defends this on
-- the way *out*: src/lib/themes.ts resolveTheme() maps an unknown name
-- back to the default, because a name that matches no CSS rule paints the
-- page with no tokens at all. That guard is tested and runs in both the
-- store and the pre-paint script, so it covers a bad value from any
-- source — including this column.

alter table public.settings
  add column if not exists theme text,
  add column if not exists theme_mode text;
