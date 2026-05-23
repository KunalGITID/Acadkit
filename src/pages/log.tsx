import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAttendance } from "@/hooks/useAttendance";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ACADKIT_STUDY_LOG";

type DayLog = { hours: string; note: string };
type LogData = Record<string, DayLog>;

function loadLog(): LogData {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as LogData;
  } catch {
    return {};
  }
}

function saveLog(data: LogData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekDates(offset: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

const DAY_ABBR = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const MON_ABBR = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

export default function LogPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [logData, setLogData] = useState<LogData>(loadLog);
  const [editing, setEditing] = useState<{ date: string; field: "hours" | "note" } | null>(null);

  const { data: allAttendance = [] } = useAttendance();
  const subjects = useAppStore((s) => s.subjects);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const updateDay = (dateKey: string, field: "hours" | "note", value: string) => {
    const updated: LogData = {
      ...logData,
      [dateKey]: {
        hours: logData[dateKey]?.hours ?? "",
        note: logData[dateKey]?.note ?? "",
        [field]: value,
      },
    };
    setLogData(updated);
    saveLog(updated);
  };

  const weekTotal = useMemo(() =>
    weekDates.slice(0, 6).reduce((sum, date) => {
      const h = parseFloat(logData[toDateKey(date)]?.hours ?? "");
      return sum + (isNaN(h) ? 0 : h);
    }, 0),
  [weekDates, logData]);

  const daysLogged = weekDates.slice(0, 6).filter(
    (d) => (logData[toDateKey(d)]?.hours ?? "") !== ""
  ).length;

  // Absence log computation
  const absentLog = useMemo(() => {
    const absents = allAttendance.filter((r) => r.status === "absent");
    const byDate: Record<string, Record<string, number>> = {};
    for (const r of absents) {
      if (!byDate[r.date]) byDate[r.date] = {};
      byDate[r.date][r.subject_id] = (byDate[r.date][r.subject_id] ?? 0) + 1;
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 20)
      .map(([date, subjectCounts]) => {
        const d = new Date(date + "T00:00:00");
        const dStr = `${String(d.getDate()).padStart(2,"0")}-${MON_ABBR[d.getMonth()]}-${d.getFullYear()}`;
        const parts = Object.entries(subjectCounts).map(([sid, count]) => {
          const code = subjects.find((s) => s.id === sid)?.code ?? "???";
          return count > 1 ? `${code}(×${count})` : code;
        });
        return { date, dStr, parts };
      });
  }, [allAttendance, subjects]);

  const weekLabel = `C:\\ACADKIT\\LOG\\WK-${isoWeekNumber(weekDates[0])}\\${weekDates[0].getFullYear()}>`;

  return (
    <main className="min-h-screen bg-black pb-24 font-mono">
      {/* Terminal header */}
      <div className="border-b border-[#00ff41]/15 bg-black px-4 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-[#00ff41] tracking-wider">
              AcadKit Study Terminal [v2.0.6]
            </p>
            <p className="text-[10px] text-[#00ff41]/40">
              (c) {new Date().getFullYear()} — All records reserved.
            </p>
          </div>
          <Link
            to="/"
            className="text-[10px] text-[#00ff41]/40 hover:text-[#00ff41] tracking-widest border border-[#00ff41]/20 px-2 py-1 rounded"
          >
            ← EXIT
          </Link>
        </div>
        <p className="mt-3 text-xs text-[#00ff41] tracking-wider">{weekLabel}</p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w - 1)}
            className="text-[9px] text-[#00ff41]/50 hover:text-[#00ff41] border border-[#00ff41]/20 px-2 py-1 rounded tracking-widest"
          >
            [◀ PREV]
          </button>
          {weekOffset < 0 && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="text-[9px] text-[#00ffff]/60 hover:text-[#00ffff] border border-[#00ffff]/20 px-2 py-1 rounded tracking-widest"
            >
              [NOW]
            </button>
          )}
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w + 1)}
            disabled={weekOffset >= 0}
            className="text-[9px] text-[#00ff41]/50 hover:text-[#00ff41] border border-[#00ff41]/20 px-2 py-1 rounded tracking-widest disabled:opacity-20"
          >
            [NEXT ▶]
          </button>
        </div>
      </div>

      <div className="px-4 py-3 space-y-1">
        {/* Section header */}
        <p className="text-[10px] text-[#00ff41]/40 tracking-widest mb-2">
          &gt; TYPE: STUDY_LOG -- week {isoWeekNumber(weekDates[0])}
        </p>

        {/* Log rows */}
        {weekDates.map((date, i) => {
          const key = toDateKey(date);
          const isSunday = i === 6;
          const isToday = date.getTime() === today.getTime();
          const isFuture = date > today;
          const entry = logData[key];
          const dayStr = `${DAY_ABBR[i]} ${String(date.getDate()).padStart(2, "0")} ${MON_ABBR[date.getMonth()]}`;

          if (isSunday) {
            return (
              <div key={key} className={cn("flex items-center gap-3 py-1", isToday && "bg-[#00ff41]/5")}>
                <span className="text-[#00ff41]/30 text-xs w-5 select-none">&gt;</span>
                <span className={cn("text-xs w-24", isToday ? "text-[#00ff41]" : "text-[#00ff41]/40")}>
                  {dayStr}
                </span>
                <span className="text-[11px] text-[#00ffff]/30 tracking-[0.2em]">[ BREAK ]</span>
                {isToday && <span className="ml-auto text-[9px] text-[#00ff41] animate-pulse">■</span>}
              </div>
            );
          }

          return (
            <div
              key={key}
              className={cn(
                "py-1.5",
                isToday && "bg-[#00ff41]/5 rounded",
                isFuture && "opacity-20"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-[#00ff41]/30 text-xs w-5 select-none">&gt;</span>
                <span className={cn("text-xs w-24 shrink-0", isToday ? "text-[#00ff41] font-bold" : "text-[#00ff41]/60")}>
                  {dayStr}
                </span>

                {/* Hours */}
                <span className="text-[#00ff41]/30 text-xs shrink-0">HRS:</span>
                {editing?.date === key && editing.field === "hours" ? (
                  <input
                    autoFocus
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    value={entry?.hours ?? ""}
                    onChange={(e) => updateDay(key, "hours", e.target.value)}
                    onBlur={() => setEditing(null)}
                    onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
                    className="w-14 bg-black text-[#00ffff] text-xs outline-none border-b border-[#00ffff]/60 px-1"
                    placeholder="0.0"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => !isFuture && setEditing({ date: key, field: "hours" })}
                    className={cn(
                      "w-14 text-left text-xs px-1",
                      isFuture ? "cursor-default" : "cursor-text hover:bg-[#00ff41]/10",
                      entry?.hours ? "text-[#00ffff]" : "text-[#00ff41]/20"
                    )}
                  >
                    {entry?.hours ? `${parseFloat(entry.hours).toFixed(1)}` : "___"}
                  </button>
                )}

                {isToday && <span className="ml-auto text-[9px] text-[#00ff41] animate-pulse">■</span>}
              </div>

              {/* Note */}
              <div className="flex items-center gap-2 pl-7 mt-0.5">
                <span className="text-[#00ff41]/25 text-[9px] tracking-widest w-24 shrink-0">NOTE:</span>
                {editing?.date === key && editing.field === "note" ? (
                  <input
                    autoFocus
                    type="text"
                    value={entry?.note ?? ""}
                    onChange={(e) => updateDay(key, "note", e.target.value)}
                    onBlur={() => setEditing(null)}
                    onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
                    className="min-w-0 flex-1 bg-black text-[#00ff41] text-xs outline-none border-b border-[#00ff41]/30 px-1"
                    placeholder="add note..."
                    maxLength={120}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => !isFuture && setEditing({ date: key, field: "note" })}
                    className={cn(
                      "min-w-0 flex-1 text-left text-xs px-1 truncate",
                      isFuture ? "cursor-default" : "cursor-text hover:bg-[#00ff41]/10",
                      entry?.note ? "text-[#00ff41]/70" : "text-[#00ff41]/15"
                    )}
                  >
                    {entry?.note || "─ ─ ─ ─ ─ ─ ─ ─"}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Week total */}
        <div className="border-t border-[#00ff41]/15 pt-2 mt-3 flex items-center justify-between">
          <span className="text-[9px] text-[#00ff41]/30 tracking-[0.3em]">WEEK_TOTAL:</span>
          <span className={cn("text-sm font-bold", weekTotal > 0 ? "text-[#00ffff]" : "text-[#00ff41]/20")}>
            {weekTotal > 0 ? `${weekTotal.toFixed(1)} HRS` : "__.__  HRS"}
          </span>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mt-2">
          {[
            { label: "DAILY_AVG", value: daysLogged > 0 ? `${(weekTotal / daysLogged).toFixed(1)}H` : "--" },
            { label: "DAYS_DONE", value: `${daysLogged}/6`, color: daysLogged === 6 ? "text-[#4ade80]" : "text-[#00ffff]" },
            { label: "WK_NO", value: `#${isoWeekNumber(weekDates[0])}` },
          ].map((s) => (
            <div key={s.label} className="border border-[#00ff41]/10 p-2 text-center">
              <p className="text-[8px] text-[#00ff41]/25 tracking-widest">{s.label}</p>
              <p className={cn("text-sm font-bold mt-0.5", s.color ?? "text-[#00ffff]")}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* ── ABSENCE LOG ── */}
        <div className="mt-5">
          <p className="text-[10px] text-[#00ff41]/40 tracking-widest mb-1">
            &gt; TYPE: ABSENCE_LOG --all
          </p>
          <div className="border border-[#fb7185]/20 rounded p-3 space-y-1.5">
            {absentLog.length === 0 ? (
              <p className="text-[11px] text-[#00ff41]/20 tracking-wider">
                &gt; NO ABSENCES FOUND. STATUS: CLEAN ✓
              </p>
            ) : (
              absentLog.map(({ date, dStr, parts }) => (
                <div key={date} className="flex items-start gap-3 text-xs">
                  <span className="shrink-0 text-[#fb7185]/50 w-24">[{dStr}]</span>
                  <span className="text-[#fb7185]/30 shrink-0">→</span>
                  <span className="text-[#fb7185]/70 min-w-0 break-words">{parts.join(", ")}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <p className="text-center text-[8px] text-[#00ff41]/10 tracking-[0.3em] mt-4">
          TAP HRS OR NOTE TO EDIT · DATA STORED LOCALLY
        </p>
      </div>
    </main>
  );
}
