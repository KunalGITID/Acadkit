import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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

  const weekLabel = `WK-${isoWeekNumber(weekDates[0])} // ${MON_ABBR[weekDates[0].getMonth()]} ${weekDates[0].getFullYear()}`;

  return (
    <main className="min-h-screen bg-[#050a05] pb-24 font-mono">
      <header className="sticky top-0 z-40 border-b border-[#00ff41]/20 bg-[#050a05]/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Link
                to="/"
                className="text-[10px] text-[#00ff41]/40 hover:text-[#00ff41] tracking-widest"
              >
                ← HOME
              </Link>
              <span className="text-[#00ff41]/20 text-[10px]">//</span>
              <span className="text-[10px] text-[#00ff41]/60 tracking-widest">STUDY_LOG</span>
            </div>
            <p className="mt-1 text-xs text-[#00ffff]/60 tracking-[0.2em]">{weekLabel}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w - 1)}
              className="rounded border border-[#00ff41]/20 px-2.5 py-1.5 text-[10px] text-[#00ff41]/50 hover:border-[#00ff41]/50 hover:text-[#00ff41] tracking-widest"
            >
              ◀ PREV
            </button>
            {weekOffset < 0 && (
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className="rounded border border-[#00ffff]/20 px-2 py-1.5 text-[10px] text-[#00ffff]/50 hover:text-[#00ffff] tracking-widest"
              >
                NOW
              </button>
            )}
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w + 1)}
              disabled={weekOffset >= 0}
              className="rounded border border-[#00ff41]/20 px-2.5 py-1.5 text-[10px] text-[#00ff41]/50 hover:border-[#00ff41]/50 hover:text-[#00ff41] tracking-widest disabled:opacity-25 disabled:cursor-not-allowed"
            >
              NEXT ▶
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 py-4 space-y-3">
        <div className="rounded-lg border border-[#00ff41]/20 overflow-hidden">
          {/* Terminal title bar */}
          <div className="flex items-center gap-2 border-b border-[#00ff41]/15 bg-[#00ff41]/5 px-4 py-2">
            <span className="h-2 w-2 rounded-full bg-[#fb7185]/50" />
            <span className="h-2 w-2 rounded-full bg-[#facc15]/50" />
            <span className="h-2 w-2 rounded-full bg-[#00ff41]/50" />
            <span className="ml-3 text-[10px] text-[#00ff41]/30 tracking-[0.3em]">STUDY_LOG.SYS</span>
            <span className="ml-auto text-[10px] text-[#00ff41]/20">■</span>
          </div>

          {/* Log rows */}
          <div className="divide-y divide-[#00ff41]/10">
            {weekDates.map((date, i) => {
              const key = toDateKey(date);
              const isSunday = i === 6;
              const isToday = date.getTime() === today.getTime();
              const isFuture = date > today;
              const entry = logData[key];
              const dayStr = `${DAY_ABBR[i]} ${String(date.getDate()).padStart(2, "0")} ${MON_ABBR[date.getMonth()]}`;

              if (isSunday) {
                return (
                  <div
                    key={key}
                    className={cn(
                      "flex items-center gap-4 px-4 py-3",
                      isToday && "bg-[#00ff41]/5"
                    )}
                  >
                    <span className="text-[#00ff41]/25 text-xs select-none">{">"}</span>
                    <span className={cn("text-xs w-24", isToday ? "text-[#00ff41]" : "text-[#00ff41]/40")}>
                      {dayStr}
                    </span>
                    <span className="text-xs text-[#00ffff]/30 tracking-[0.25em]">[ BREAK ]</span>
                    {isToday && (
                      <span className="ml-auto text-[9px] text-[#00ff41] animate-pulse tracking-wider">◾ NOW</span>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={key}
                  className={cn(
                    "px-4 py-3 space-y-2",
                    isToday && "bg-[#00ff41]/5",
                    isFuture && "opacity-25"
                  )}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[#00ff41]/25 text-xs select-none">{">"}</span>
                    <span
                      className={cn(
                        "text-xs w-24 shrink-0",
                        isToday ? "text-[#00ff41] font-bold" : "text-[#00ff41]/60"
                      )}
                    >
                      {dayStr}
                    </span>

                    {/* Hours field */}
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[#00ff41]/25 text-xs">[</span>
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
                          className="w-12 bg-transparent text-[#00ffff] text-xs outline-none text-center border-b border-[#00ffff]/40 placeholder:text-[#00ffff]/20"
                          placeholder="0.0"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => !isFuture && setEditing({ date: key, field: "hours" })}
                          className={cn(
                            "w-12 text-center text-xs transition-colors",
                            isFuture ? "cursor-default" : "cursor-text hover:text-[#00ffff]",
                            entry?.hours ? "text-[#00ffff]" : "text-[#00ff41]/25"
                          )}
                        >
                          {entry?.hours
                            ? `${parseFloat(entry.hours).toFixed(1)}`
                            : " ─ ─ "}
                        </button>
                      )}
                      <span className="text-[#00ff41]/25 text-xs">] HRS</span>
                    </div>

                    {isToday && (
                      <span className="ml-auto text-[9px] text-[#00ff41] animate-pulse tracking-wider">◾ NOW</span>
                    )}
                  </div>

                  {/* Note field */}
                  <div className="flex items-center gap-2 pl-6">
                    <span className="shrink-0 text-[9px] text-[#00ff41]/25 tracking-[0.25em]">NOTE:</span>
                    {editing?.date === key && editing.field === "note" ? (
                      <input
                        autoFocus
                        type="text"
                        value={entry?.note ?? ""}
                        onChange={(e) => updateDay(key, "note", e.target.value)}
                        onBlur={() => setEditing(null)}
                        onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
                        className="min-w-0 flex-1 bg-transparent text-[#00ff41] text-xs outline-none border-b border-[#00ff41]/20 placeholder:text-[#00ff41]/20"
                        placeholder="enter note..."
                        maxLength={120}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => !isFuture && setEditing({ date: key, field: "note" })}
                        className={cn(
                          "min-w-0 flex-1 text-left text-xs truncate transition-colors",
                          isFuture ? "cursor-default" : "cursor-text",
                          entry?.note
                            ? "text-[#00ff41]/70 hover:text-[#00ff41]"
                            : "text-[#00ff41]/20 hover:text-[#00ff41]/40"
                        )}
                      >
                        {entry?.note || "─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Week footer */}
          <div className="flex items-center justify-between border-t border-[#00ff41]/15 bg-[#00ff41]/5 px-4 py-2.5">
            <span className="text-[9px] text-[#00ff41]/30 tracking-[0.3em]">WEEK TOTAL</span>
            <span className={cn(
              "text-sm font-bold tracking-wider",
              weekTotal > 0 ? "text-[#00ffff]" : "text-[#00ff41]/20"
            )}>
              {weekTotal > 0 ? `${weekTotal.toFixed(1)} HRS` : "── HRS"}
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            {
              label: "DAILY AVG",
              value: daysLogged > 0 ? `${(weekTotal / daysLogged).toFixed(1)}H` : "──",
              color: "text-[#00ffff]",
            },
            {
              label: "DAYS LOGGED",
              value: `${daysLogged}/6`,
              color: daysLogged === 6 ? "text-[#4ade80]" : "text-[#00ffff]",
            },
            {
              label: "WEEK NO.",
              value: `#${isoWeekNumber(weekDates[0])}`,
              color: "text-[#00ff41]/60",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded border border-[#00ff41]/15 bg-[#00ff41]/5 p-2 text-center"
            >
              <p className="text-[9px] text-[#00ff41]/30 tracking-[0.2em]">{stat.label}</p>
              <p className={cn("mt-1 text-sm font-bold", stat.color)}>{stat.value}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-[9px] text-[#00ff41]/15 tracking-[0.3em]">
          TAP HRS OR NOTE TO EDIT · STORED LOCALLY
        </p>
      </div>
    </main>
  );
}
