# Changelog

All notable changes to AcadKit are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/): a major version for changes that break
existing data or installs, a minor version for new features, a patch version for fixes.

## [Unreleased]

## [2.1.0] - 2026-09-30

Ready for more than one student: a proper welcome for new accounts, easier reading in
light mode, and a faster first visit.

### Added

- A landing page for visitors who aren't signed in: what AcadKit does, a demo recorded on
  sample data, how your data is handled, and Get started / Sign in (#23).
- Onboarding for new students: your name, semester, minimum attendance and target SGPA,
  then your subjects - pasted from the SRM portal's attendance page (any branch; credits
  filled in where known, the rest asked for), the CSE (Data Science) Semester 3 list, or
  none. The attendance you paste is kept (#20).
- A "Getting started" card on Home until your timetable is added and AcadKit is on your
  home screen (#20).
- The version is shown at the bottom of Settings, to quote in a bug report (#19).

### Changed

- A first visit downloads a third as much (106 KB instead of 292 KB) and shows its main
  content in 3.2 s instead of 4.3 s on a slow phone; the app loads as you reach for
  Sign in (#24).
- Primary buttons are black on lime instead of white on lime, and lime text in light mode
  is a dark olive, so both can be read (#21).

### Fixed

- Text too faint to read comfortably, found by an accessibility check now run on every
  main screen in light and dark mode: warnings, grade badges, calendar labels, weekend
  dates and faded labels (#19, #21).
- Pinch-zoom works again. Text fields stay at 16px on phones, so iOS still doesn't zoom
  into them when tapped (#21).

### Removed

- The marks trend sparkline on subject cards (#3).

### Development

- CI on every pull request: lint, typecheck, unit tests and build (#2), end-to-end tests
  with Playwright on the mock backend (#4), row-level security tests with pgTAP (#5),
  bundle-size and Lighthouse budgets (#19, #24), and an axe accessibility check (#21).
- Dependabot, issue and PR templates, `CONTRIBUTING.md`, and releases published from this
  file when a version tag is pushed (#5).
- Crash reports carry the release they came from, and repeats of one crash are grouped;
  `npm run errors` prints them (#19, migration 038).
- Usage counted without tracking anyone: each account records only the days it opens the
  app, and `npm run stats` shows weekly active users (#22, migration 039).
- `npm run demo:record` re-records the landing page's demo (#23).
- MIT licence (#12).

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

[Unreleased]: https://github.com/KunalGITID/Acadkit/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/KunalGITID/Acadkit/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/KunalGITID/Acadkit/releases/tag/v2.0.0
