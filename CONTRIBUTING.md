# Contributing to AcadKit

Thanks for helping. Bug reports, ideas and pull requests are all welcome. Start with an
[issue](https://github.com/KunalGITID/Acadkit/issues/new/choose) for anything bigger than
a small fix, so we can agree on the approach first.

## Running it

```bash
npm install
npm run dev:mock    # the app on http://localhost:5173, with a seeded mock backend
```

`dev:mock` needs no accounts or keys: any email and password signs in, to a semester of
fake data. [ARCHITECTURE.md](ARCHITECTURE.md) explains how the pieces fit together.

## Checks

CI runs all of these on every pull request, and a PR merges only when they pass.

| Command                                | What it checks                                      |
| -------------------------------------- | --------------------------------------------------- |
| `npm run lint`                         | ESLint                                              |
| `npm run typecheck`                    | TypeScript, including the e2e tests                 |
| `npm test`                             | Unit tests (Vitest)                                 |
| `npm run test:e2e`                     | The app in a browser against `dev:mock` (Playwright) |
| `supabase start` then `supabase test db --local` | Row-level security (pgTAP, needs Docker) |
| `npx vite build && npm run size`       | Bundle size against `bundle-budget.json`            |
| `npx vite build && npx @lhci/cli@0.15.1 autorun` | Lighthouse against `lighthouserc.json` |

The size and Lighthouse limits sit a little above today's numbers. If a change needs more,
raise the limit in the same PR and say why.

The first time you run the e2e tests, install the browser with
`npx playwright install chromium`.

## Database changes

- Add a new numbered file to `supabase/migrations/` (the next number after the last one).
  Never edit a migration that has already been applied.
- Every table holds a `device_id` and needs row-level security with a policy that checks
  `owns_device(device_id)`. The RLS tests fail if a table in `public` has RLS off.
- Add the new table to `supabase/tests/database/rls.test.sql`, so the tests prove one
  account can't read or change another's rows in it.
- Migrations are applied to the hosted project by hand, one at a time. Don't run
  `supabase db push`.

## Pull requests

- Keep each PR to one change, and explain in the description what it changes and why.
- Add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md).
- Never commit keys, `.env.local`, or anyone's personal data (PINs, register numbers,
  marks). The repository is public.

## Releases

Versions follow [Semantic Versioning](https://semver.org/). To release:

1. Move the **Unreleased** entries in `CHANGELOG.md` under a new heading such as
   `## [2.1.0] - 2026-11-18`, and update the links at the bottom.
2. Set the same version in `package.json` with `npm version 2.1.0 --no-git-tag-version`.
3. Merge that to `main`, then tag it: `git tag v2.1.0 && git push origin v2.1.0`.

The Release workflow checks the tag matches `package.json`, then publishes a GitHub release
with that version's changelog section as its notes.

## Security

If you find a way to reach someone else's data, please don't open a public issue.
[Report it privately](https://github.com/KunalGITID/Acadkit/security/advisories/new)
instead.
