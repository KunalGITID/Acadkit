import { supabase } from "@/lib/supabase";
import { getStoredPin } from "@/lib/pin";
import { isStaleChunkError, recoverFromStaleChunk } from "@/lib/staleChunk";

/**
 * Best-effort crash reporting.
 *
 * Two things this has to survive, because the reports that matter most
 * come from exactly these situations:
 *
 *  - **Being signed out.** `error_log`'s policy is `to authenticated`
 *    (migration 015), and the ErrorBoundary wraps SignIn and Onboarding
 *    too. A crash before sign-in returns 42501 and the row is lost —
 *    which is the report you most want, because the person is looking
 *    at an app they cannot get into. Those are held in localStorage and
 *    filed on the next successful sign-in instead of thrown away.
 *  - **Not being a render error.** React error boundaries only catch
 *    crashes during render. An unhandled rejection in a mutation, an
 *    effect, or a push handler bypassed all of this and vanished, so
 *    the table only ever described one narrow class of failure.
 */

const PENDING_KEY = "acadkit:pending-crashes";
const MAX_PENDING = 5;

export interface CrashReport {
  device_id: string | null;
  message: string;
  stack: string;
  component_stack: string;
  url: string;
  user_agent: string;
}

/**
 * Reading the pin touches localStorage, which throws outright when
 * storage is disabled rather than returning null. On the crash path
 * that would turn a report into a second crash, so an unknown device is
 * better than no report.
 */
function pinOrNull(): string | null {
  try {
    return getStoredPin();
  } catch {
    return null;
  }
}

export function buildReport(
  error: unknown,
  componentStack?: string | null
): CrashReport {
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    device_id: pinOrNull(),
    message: err.message.slice(0, 1000),
    stack: (err.stack ?? "").slice(0, 4000),
    component_stack: (componentStack ?? "").slice(0, 4000),
    url: location.pathname,
    user_agent: navigator.userAgent,
  };
}

function readPending(): CrashReport[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as CrashReport[]) : [];
  } catch {
    return [];
  }
}

function writePending(reports: CrashReport[]): void {
  try {
    // Newest wins: a boot loop would otherwise fill the cap with the
    // same first failure and crowd out whatever it turned into.
    localStorage.setItem(PENDING_KEY, JSON.stringify(reports.slice(-MAX_PENDING)));
  } catch {
    // Private mode or storage disabled. Nothing to do — a lost crash
    // report must never itself become a crash.
  }
}

/** Queue a report for the next sign-in. */
function holdReport(report: CrashReport): void {
  writePending([...readPending(), report]);
}

/**
 * Send a report, holding it for later if the write is rejected.
 *
 * Deliberately never throws and never rejects: every caller is already
 * on a failure path.
 */
export async function fileReport(report: CrashReport): Promise<void> {
  try {
    const { error } = await supabase.from("error_log").insert(report);
    if (error) holdReport(report);
  } catch {
    holdReport(report);
  }
}

/** Drain anything captured while signed out. Called after a session lands. */
export async function flushPendingReports(): Promise<void> {
  const pending = readPending();
  if (pending.length === 0) return;
  // Clear first: a failure here re-queues through fileReport, and
  // leaving them in place would double them up instead.
  writePending([]);
  for (const report of pending) await fileReport(report);
}

/**
 * Catch what the ErrorBoundary structurally cannot: async failures.
 *
 * Idempotent — StrictMode mounts effects twice in development, and a
 * second set of listeners would file every crash twice.
 */
let installed = false;

export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  window.addEventListener("unhandledrejection", (e) => {
    // A dynamic import that lost its chunk to a deploy surfaces here
    // when nothing rendered it — same non-crash, same fix.
    if (isStaleChunkError(e.reason) && recoverFromStaleChunk()) return;
    void fileReport(buildReport(e.reason, "unhandled rejection"));
  });
  window.addEventListener("error", (e) => {
    // Resource load failures (a dead <img>) fire here too and carry no
    // Error; they are not crashes and would drown the real ones.
    if (!e.error) return;
    if (isStaleChunkError(e.error) && recoverFromStaleChunk()) return;
    void fileReport(buildReport(e.error, "uncaught error"));
  });
}
