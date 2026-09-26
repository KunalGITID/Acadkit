import type { PortalSnapshotHistory, Subject, TimetableSlot } from "@/types";

/**
 * Portal sanity checks: things a sync reported that can't be right, or
 * that are worth a second look before every number in the app moves.
 *
 * The portal is the baseline under every attendance figure, and it is
 * scraped from HTML — a misread table or a mid-semester correction
 * shifts everything silently. With the sync history kept (migration
 * 029), each sync can be compared with the one before it.
 *
 * Mostly rules, because each has a plain reason: classes held never go
 * down, you can't miss more classes than were held, and the portal's own
 * percentage should match its own counts. The one statistical check —
 * an absence spike — needs a few syncs of history before it speaks, and
 * uses the median and MAD rather than a mean and SD, so one earlier odd
 * week can't hide or fake it.
 */

export type AnomalyKind =
  | "conducted-down"
  | "absent-down"
  | "impossible"
  | "percentage-mismatch"
  | "more-than-scheduled"
  | "absence-spike";

export interface PortalAnomaly {
  subjectCode: string;
  subject: Subject | null;
  kind: AnomalyKind;
  /** "warn" is likely wrong data; "info" is worth knowing but may be real. */
  severity: "warn" | "info";
  message: string;
  /** The sync it was found in. */
  syncedAt: string;
}

export interface AnomalyInput {
  history: PortalSnapshotHistory[];
  subjects: Subject[];
  timetable: TimetableSlot[];
  /** Effective date → day order, declared holidays already shifted. */
  effMap: Record<string, number>;
}

const codeKey = (s: string) => s.trim().toUpperCase();

/** Scheduled classes of a subject in (after, upTo], by the timetable. */
function scheduledBetween(
  subjectId: string | undefined,
  after: string,
  upTo: string,
  timetable: TimetableSlot[],
  effMap: Record<string, number>
): number | null {
  if (!subjectId) return null;
  const perDayOrder = new Map<number, number>();
  for (const s of timetable) {
    if (s.subject_id !== subjectId) continue;
    perDayOrder.set(s.day_order, (perDayOrder.get(s.day_order) ?? 0) + 1);
  }
  if (perDayOrder.size === 0) return null;
  let n = 0;
  for (const [date, order] of Object.entries(effMap)) {
    if (date > after && date <= upTo) n += perDayOrder.get(order) ?? 0;
  }
  return n;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Anomalies in each subject's latest sync, compared with the sync
 * before it. Only the latest: an old oddity that later syncs agreed
 * with has already been absorbed, and repeating it forever is noise.
 */
export function portalAnomalies({ history, subjects, timetable, effMap }: AnomalyInput): PortalAnomaly[] {
  const bySubject = new Map(subjects.map((s) => [codeKey(s.code), s]));
  const series = new Map<string, PortalSnapshotHistory[]>();
  for (const h of history) {
    const list = series.get(codeKey(h.subject_code)) ?? [];
    list.push(h);
    series.set(codeKey(h.subject_code), list);
  }

  const out: PortalAnomaly[] = [];
  for (const [code, rows] of series) {
    rows.sort((a, b) => a.synced_at.localeCompare(b.synced_at));
    const cur = rows[rows.length - 1];
    const subject = bySubject.get(code) ?? null;
    const push = (kind: AnomalyKind, severity: PortalAnomaly["severity"], message: string) =>
      out.push({ subjectCode: cur.subject_code, subject, kind, severity, message, syncedAt: cur.synced_at });

    // The portal's own printed percentage against its own counts.
    if (cur.percentage !== null && cur.conducted > 0) {
      const computed = (100 * (cur.conducted - cur.absent)) / cur.conducted;
      if (Math.abs(computed - Number(cur.percentage)) > 1.5) {
        push(
          "percentage-mismatch",
          "warn",
          `The portal printed ${Number(cur.percentage).toFixed(1)}%, but its own counts (${cur.conducted - cur.absent} of ${cur.conducted}) make ${computed.toFixed(1)}% — the page may have been read wrong.`
        );
      }
    }

    if (rows.length < 2) continue;
    const prev = rows[rows.length - 2];
    const dc = cur.conducted - prev.conducted;
    const da = cur.absent - prev.absent;

    if (dc < 0) {
      push(
        "conducted-down",
        "warn",
        `Classes held went down from ${prev.conducted} to ${cur.conducted}. The portal corrected something, or the page was read wrong.`
      );
    }
    if (da < 0) {
      push(
        "absent-down",
        "info",
        `Absences dropped from ${prev.absent} to ${cur.absent} — an On Duty approved, or a correction? Worth checking before trusting the new figure.`
      );
    }
    if (da > 0 && da > Math.max(dc, 0)) {
      push(
        "impossible",
        "warn",
        `${count(da, "absence", "absences")} more, but only ${count(Math.max(dc, 0), "class", "classes")} more held — that can't happen.`
      );
    }

    const scheduled = scheduledBetween(subject?.id, prev.as_of, cur.as_of, timetable, effMap);
    if (scheduled !== null && dc > scheduled + 2) {
      push(
        "more-than-scheduled",
        "info",
        `${count(dc, "class", "classes")} held since the last sync, but your timetable only had ${scheduled}. An extra class, or a slot missing from your timetable?`
      );
    }

    // An absence spike, judged against your own earlier syncs.
    const intervals: Array<{ held: number; rate: number }> = [];
    for (let i = 1; i < rows.length; i++) {
      const held = rows[i].conducted - rows[i - 1].conducted;
      const missed = rows[i].absent - rows[i - 1].absent;
      if (held >= 2 && missed >= 0 && missed <= held) intervals.push({ held, rate: missed / held });
    }
    const latest = intervals[intervals.length - 1];
    const earlier = intervals.slice(0, -1);
    if (latest && earlier.length >= 4 && dc >= 2 && da >= 0 && da <= dc) {
      const rates = earlier.map((x) => x.rate);
      const mid = median(rates);
      const mad = median(rates.map((r) => Math.abs(r - mid))) || 0.05;
      const z = (latest.rate - mid) / (1.4826 * mad);
      if (z > 3.5 && latest.rate >= 0.5) {
        const usual = mid > 0 ? `about 1 in ${Math.max(1, Math.round(1 / mid))}` : "almost none";
        push(
          "absence-spike",
          "info",
          `You missed ${da} of the last ${dc} classes; you usually miss ${usual}.`
        );
      }
    }
  }

  const order: Record<PortalAnomaly["severity"], number> = { warn: 0, info: 1 };
  return out.sort((a, b) => order[a.severity] - order[b.severity] || a.subjectCode.localeCompare(b.subjectCode));
}
