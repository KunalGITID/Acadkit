-- Schedule send-reminders every 10 minutes via pg_cron + pg_net.
-- Run this once in the Supabase SQL editor AFTER deploying the function
-- and setting its secrets. Replace <PROJECT_REF> and <CRON_SECRET>.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'acadkit-send-reminders',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To remove later:  select cron.unschedule('acadkit-send-reminders');
