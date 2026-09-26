import { ODDS_MODEL, type SemesterOdds } from "@/lib/odds";
import { addDays, parseISODate } from "@/lib/dates";
import type { ForecastLogRow } from "@/types";

/**
 * The weekly forecast log (migration 029).
 *
 * A forecast nobody checks is decoration. Once a week the app writes down
 * what the odds said — per subject and for the SGPA — so that when real
 * grades arrive, the forecasts can be scored (Brier score, calibration;
 * see notebooks/acadkit_analysis.ipynb). The first forecast of a week
 * stands: the table is insert-only, and the logger asks once per week.
 */

/** Monday of the week `date` falls in, as "YYYY-MM-DD". */
export function weekStart(date: string): string {
  const day = parseISODate(date).getDay(); // 0 = Sunday
  return addDays(date, -((day + 6) % 7));
}

const round = (n: number, places = 4) => Math.round(n * 10 ** places) / 10 ** places;

/** The rows to log for one week: every subject, then the semester. */
export function forecastRows(
  pin: string,
  week: string,
  odds: SemesterOdds
): ForecastLogRow[] {
  const rows: ForecastLogRow[] = odds.subjects.map((o) => ({
    device_id: pin,
    week_start: week,
    scope: o.subjectId,
    target: o.target,
    p_target: round(o.pTarget),
    p_pass: round(o.pPass),
    median: round(o.median, 2),
    p10: round(o.p10, 2),
    p90: round(o.p90, 2),
    distribution: Object.fromEntries(
      Object.entries(o.distribution).map(([g, p]) => [g, round(p)])
    ),
    evidence: o.evidence,
    model: ODDS_MODEL,
  }));
  if (odds.sgpa) {
    rows.push({
      device_id: pin,
      week_start: week,
      scope: "sgpa",
      target: String(odds.sgpa.target),
      p_target: round(odds.sgpa.pTarget),
      p_pass: null,
      median: round(odds.sgpa.median, 3),
      p10: round(odds.sgpa.p10, 3),
      p90: round(odds.sgpa.p90, 3),
      distribution: null,
      evidence: odds.subjects.reduce((a, o) => a + o.evidence, 0),
      model: ODDS_MODEL,
    });
  }
  return rows;
}
