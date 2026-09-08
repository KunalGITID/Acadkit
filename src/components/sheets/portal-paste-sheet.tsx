import { useRef, useState } from "react";
import { ClipboardPaste, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import * as api from "@/api/queries";
import { usePin, useSubjects, useTimetable } from "@/hooks/useData";
import { looksLikeHtml, parsePastedPortal, type PastedPortal } from "@/lib/portal/paste";
import { periodsFromSlots } from "@/lib/portal/timetable";
import { broadcastInvalidate } from "@/lib/broadcast";
import { haptic } from "@/lib/utils";

/**
 * Refreshing from the portal on a phone.
 *
 * The bookmarklet is desktop-only, so the device you actually carry had
 * no way to pull fresh figures — which is the root of every "why
 * doesn't this match the portal" moment. Copying the report and pasting
 * it here reuses the same parser: no OCR, no scraping service, and the
 * portal password is still never involved.
 *
 * A contenteditable catching a real paste event, rather than
 * navigator.clipboard.read(): the read API needs a permission Safari is
 * stingy with, while a paste event hands over `text/html` directly and
 * is a gesture the user already understands.
 *
 * The timetable page comes through the same box. It is the page worth
 * pasting most — every derived number in the app is computed off those
 * slots — and it used to be the only one you had to type in by hand.
 */
export function PortalPasteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pin = usePin();
  const { data: subjects } = useSubjects();
  const { data: timetable } = useTimetable();
  const qc = useQueryClient();
  const box = useRef<HTMLDivElement>(null);
  const [parsed, setParsed] = useState<PastedPortal | null>(null);
  const [plainText, setPlainText] = useState(false);
  const [busy, setBusy] = useState(false);

  function reset() {
    setParsed(null);
    setPlainText(false);
    if (box.current) box.current.innerHTML = "";
  }

  function onPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");

    // A plain-text-only clipboard is the likely failure on iOS, and it
    // is worth naming: the parser would otherwise find no tables and
    // blame the portal for what is really a copy problem.
    if (!html || !looksLikeHtml(html)) {
      setPlainText(Boolean(text));
      setParsed(null);
      return;
    }
    setPlainText(false);
    // Your own subjects are what a grid cell is matched against, and
    // your own hours are what an untimed grid falls back to — so both
    // go in rather than being guessed at inside the parser.
    setParsed(
      parsePastedPortal(html, {
        codes: (subjects ?? []).map((s) => s.code),
        periods: periodsFromSlots(timetable ?? []),
      })
    );
    haptic();
  }

  async function save() {
    if (!parsed) return;
    setBusy(true);
    try {
      const out = await api.importPortalData(pin, {
        attendance: parsed.attendance,
        marks: parsed.marks,
      });
      const week = parsed.timetable.slots.length
        ? await api.importTimetable(pin, parsed.timetable.slots)
        : null;
      await qc.invalidateQueries();
      broadcastInvalidate(["marks", "attendance", "portalSnapshots", "timetable"]);
      const bits = [
        out.snapshots ? `${out.snapshots} subject${out.snapshots > 1 ? "s" : ""} updated` : null,
        out.marksAdded ? `${out.marksAdded} mark${out.marksAdded > 1 ? "s" : ""} added` : null,
        out.marksUpdated ? `${out.marksUpdated} updated` : null,
        week?.slots ? `${week.slots} classes on the timetable` : null,
      ].filter(Boolean);
      toast.success(bits.length ? bits.join(" · ") : "Nothing new to save");
      if (week?.slots && parsed.timetable.assumedTimes) {
        toast.message("Those hours were assumed", {
          description:
            "The grid didn't print its times, so standard 50-minute hours were used. Fix any that differ in Timetable.",
        });
      }
      const unmatched = [...new Set([...out.unmatchedCodes, ...(week?.unmatchedCodes ?? [])])];
      if (unmatched.length) {
        toast.message("Some codes didn't match a subject", {
          description: `${unmatched.join(", ")} — add them in Settings → Subjects.`,
        });
      }
      reset();
      onClose();
    } catch (err) {
      toast.error("Couldn't save the portal data", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  const total =
    (parsed?.attendance.length ?? 0) +
    (parsed?.marks.length ?? 0) +
    (parsed?.timetable.slots.length ?? 0);

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          reset();
          onClose();
        }
      }}
      title="Paste from the portal"
      description="Works on your phone — no bookmarklet needed"
    >
      <div className="space-y-3">
        <ol className="space-y-1.5 text-xs text-muted">
          <li>1. Open your attendance, marks or timetable page on the SRM portal.</li>
          <li>2. Select the whole page and copy it.</li>
          <li>3. Come back here and paste into the box below.</li>
        </ol>

        <div
          ref={box}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          tabIndex={0}
          aria-label="Paste the portal page here"
          onPaste={onPaste}
          className="max-h-28 min-h-24 overflow-hidden rounded-2xl border border-dashed bg-surface-2/40 p-4 text-xs text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {parsed || plainText ? null : "Tap here, then paste"}
        </div>

        {plainText && (
          <p className="rounded-2xl bg-warn/15 p-3 text-xs font-semibold text-warn-deep">
            That came through as plain text, so the table structure was lost. Try selecting the
            page itself rather than using Reader view — the formatting is what the parser reads.
          </p>
        )}

        {parsed && (
          <div className="space-y-2.5">
            {total === 0 ? (
              <p className="rounded-2xl bg-bad/10 p-3 text-xs font-semibold text-bad-deep">
                Found {parsed.tablesSeen} table{parsed.tablesSeen === 1 ? "" : "s"} but no
                attendance, marks or timetable in them. If this was the right page, copy the
                diagnostics below — that's what teaches the parser a layout it hasn't seen.
              </p>
            ) : (
              <div className="space-y-2.5">
                {(parsed.attendance.length > 0 || parsed.marks.length > 0) && (
                  <div className="rounded-2xl border bg-surface-2/40 p-3 text-xs">
                    <p className="font-bold">
                      {parsed.attendance.length} subject
                      {parsed.attendance.length === 1 ? "" : "s"} of attendance
                      {parsed.marks.length > 0 ? ` · ${parsed.marks.length} marks` : ""}
                    </p>
                    <ul className="mt-1.5 space-y-0.5 text-muted">
                      {parsed.attendance.slice(0, 4).map((a) => (
                        <li key={a.subject_code}>
                          {a.subject_code} — {a.conducted - a.absent}/{a.conducted}
                          {a.percentage !== null ? ` · ${a.percentage}%` : ""}
                        </li>
                      ))}
                      {parsed.attendance.length > 4 && (
                        <li>…and {parsed.attendance.length - 4} more</li>
                      )}
                    </ul>
                  </div>
                )}

                {parsed.timetable.slots.length > 0 && (
                  <div className="rounded-2xl border bg-surface-2/40 p-3 text-xs">
                    <p className="font-bold">
                      {parsed.timetable.slots.length} classes across Day Order{" "}
                      {parsed.timetable.dayOrders.join(", ")}
                    </p>
                    {/* Replacing the week is the part worth being warned
                        about before tapping Save, not after. */}
                    <p className="mt-1.5 text-muted">
                      This replaces your current timetable. Attendance you have already marked
                      is not touched.
                    </p>
                    {parsed.timetable.assumedTimes && (
                      <p className="mt-1.5 font-semibold text-warn-deep">
                        The grid didn't print its hours — standard 50-minute periods were
                        assumed.
                      </p>
                    )}
                    {parsed.timetable.unknownCodes.length > 0 && (
                      <p className="mt-1.5 text-muted">
                        Not yours, so skipped: {parsed.timetable.unknownCodes.join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {parsed.diagnostic && (
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  void navigator.clipboard.writeText(parsed.diagnostic!);
                  toast.success("Diagnostics copied");
                }}
              >
                Copy diagnostics
              </Button>
            )}

            <div className="flex gap-2.5">
              <Button variant="secondary" className="flex-1" onClick={reset}>
                Clear
              </Button>
              <Button className="flex-1" onClick={save} disabled={total === 0 || busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPaste className="h-4 w-4" />}
                Save
              </Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
