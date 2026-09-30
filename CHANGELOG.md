# Changelog

All notable changes to AcadKit are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/): a major version for changes that break
existing data or installs, a minor version for new features, a patch version for fixes.

## [Unreleased]

### Added

- End-to-end tests with Playwright on the mock backend: signing in, marking attendance,
  adding marks, and replaying a class marked offline (#4).
- Row-level security tests: two accounts are seeded in every table, and one is checked
  against reading, writing, moving or deleting the other's rows, taking its PIN,
  searching its notes and touching its study files (#5).
- CI on every pull request: lint, typecheck, unit tests and build (#2), plus the
  end-to-end (#4) and RLS (#5) suites.
- Dependabot: weekly grouped npm updates and monthly GitHub Actions updates (#5).
- Issue and pull request templates, `CONTRIBUTING.md`, and tagged releases built from
  this file (#5).
- MIT licence.

### Removed

- The marks trend sparkline on subject cards (#3).

## [2.0.0] - 2026-09-29

The first public release.

### Added

- Attendance: how many classes you can miss, and what it takes to get back above the
  minimum (75%, or 65% with medical leave).
- Marks and Targets: what each remaining test has to return for the grade you want,
  with expected marks counted.
- Timetable and calendar that follow SRM's 5-day rotating Day Order.
- Study files synced from the Mac, with an in-app viewer (PDF, Word, PowerPoint,
  spreadsheets, code) and search inside files.
- Works offline as an installable PWA, and syncs across devices when signed in.

[Unreleased]: https://github.com/KunalGITID/Acadkit/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/KunalGITID/Acadkit/releases/tag/v2.0.0
