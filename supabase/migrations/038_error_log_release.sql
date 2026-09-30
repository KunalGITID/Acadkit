-- Crash reports: which build they came from, and which ones are the same crash.
--
-- `release` is written by the app ("2.0.0+d6b27fa": package version + commit),
-- so a crash can be tied to the deploy that caused it or shown fixed by the
-- one after. Older rows stay null.
--
-- `fingerprint` groups repeats of one crash. Postgres computes it from the
-- message, so it covers the rows already logged and can't drift between app
-- versions. Build hashes in asset names ("Dashboard-CsS8WBZ-.js"), hosts and
-- numbers are stripped first: without that, one stale-chunk crash after
-- every deploy looked like a new error each time. Where it came from (a
-- render, an unhandled rejection, an uncaught error) is part of the key.

alter table error_log add column if not exists release text;

alter table error_log add column if not exists fingerprint text
  generated always as (
    left(md5(
      case
        when component_stack in ('unhandled rejection', 'uncaught error') then component_stack
        else 'render'
      end
      || ':' ||
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(coalesce(message, '')),
            '-[a-z0-9_-]{8}\.(js|css)', '.\1', 'g'),   -- build hashes
          'https?://[^/\s''"]+', '', 'g'),            -- scheme and host
        '[0-9]+', '#', 'g')                           -- line numbers, ids
    ), 12)
  ) stored;

create index if not exists idx_error_log_fingerprint on error_log (fingerprint, created_at desc);
