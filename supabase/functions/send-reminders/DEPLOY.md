# Push notifications — deploy runbook

The app code (subscribe UI, service-worker push handler, subscription
storage) is already built and live. To start *sending* reminders, deploy
the Edge Function and schedule it. One-time setup, ~10 minutes.

## 0. Prerequisites
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed and logged in:
  `supabase login`
- Link the project: `supabase link --project-ref <PROJECT_REF>`
  (`<PROJECT_REF>` is the subdomain of your Supabase URL.)

## 1. Run the DB migration
In the Supabase SQL editor, run `supabase/migrations/011_push.sql`
(creates `push_subscriptions` + `sent_notifications`).

## 2. Set the function secrets
The VAPID **public** key is already embedded in the app
(`src/lib/push.ts`). Set the **private** key + the rest as secrets:

```bash
supabase secrets set \
  VAPID_PUBLIC="<the public key from src/lib/push.ts>" \
  VAPID_PRIVATE="<the private key — kept out of git, ask Claude/your notes>" \
  VAPID_SUBJECT="mailto:you@example.com" \
  CRON_SECRET="<any long random string you choose>"
```

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)

## 3. Deploy the function
```bash
supabase functions deploy send-reminders --no-verify-jwt
```
`--no-verify-jwt` is required because the scheduler calls it with a custom
header instead of a user JWT; the function checks `CRON_SECRET` itself.

## 4. Schedule it
Edit `cron.sql` — replace `<PROJECT_REF>` and `<CRON_SECRET>` with your
values — then run it in the SQL editor. It runs the function every 10 min.

Test immediately without waiting for cron:
```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders" \
  -H "x-cron-secret: <CRON_SECRET>"
# → {"candidates":N,"sent":M}
```

## 5. On each device
Open the **installed** PWA (iPhone: Share → Add to Home Screen first),
then **Settings → Reminders → Turn on reminders** and allow notifications.

## What gets sent (IST)
- **Class soon** — when a class on today's day order starts within 15 min.
- **Mark attendance** — 6 PM nudge if today's classes are still unmarked.
- **Deadline due** — 8 AM, for anything due within 24 h.
- **Low attendance** — 8 AM, any subject under 75%.

Dedupe is handled by `sent_notifications`, so the 10-min cadence won't spam.
Keep the calendar block in `index.ts` in sync with `src/data/semester.ts`
each semester.
