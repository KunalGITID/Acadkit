# Pending migrations

SQL that is finished but **must not run yet**, kept out of
`supabase/migrations/` so `supabase db push` cannot apply it by accident.

## 015_require_auth.sql — the auth cutover

Swaps every table's `using (true)` anon policy for one that asks whether
the signed-in user owns the row's `device_id`.

Running this before you have signed in and claimed your PIN locks you
out of your own data. The order is:

1. Apply `014_device_owners.sql` (safe: adds a table, changes no policy).
2. Open the app, sign in with your email, and let it claim your PIN.
3. Verify the claim exists:

   ```sql
   select * from device_owners;   -- must show your PIN and a user_id
   ```

4. Only then move this file into `supabase/migrations/` and push it.

Until step 4, RLS still grants the anon role full access — the app has
auth, but the database is not yet enforcing it.
