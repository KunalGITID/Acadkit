import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Sigma, Star } from "lucide-react";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { useArchives, usePin } from "@/hooks/useData";
import { fetchCurriculum } from "@/api/studyFiles";
import { fetchUnits } from "@/api/units";
import { describeElectives, MATHS_HEAVY, THEMES, type Theme } from "@/lib/electives";
import { areaRecord, isWeakArea } from "@/lib/pastRecord";
import { cn } from "@/lib/utils";

const SHORTLIST_KEY = "acadkit:electives-shortlist";

function loadShortlist(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SHORTLIST_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Professional and open electives side by side, from their syllabi: what each is about, what it builds on, how much of it is maths, and a shortlist (kept on this device). */
export default function Electives() {
  const pin = usePin();
  const cur = useQuery({ queryKey: ["curriculum", pin], queryFn: () => fetchCurriculum(pin), staleTime: 60 * 60_000 });
  const units = useQuery({ queryKey: ["units", pin], queryFn: () => fetchUnits(pin), staleTime: 5 * 60_000 });
  const { data: archives } = useArchives();
  const [theme, setTheme] = useState<Theme | "all" | "shortlist">("all");
  const [kind, setKind] = useState<"E" | "O">("E");
  const [open, setOpen] = useState<string | null>(null);
  const [shortlist, setShortlist] = useState<string[]>(loadShortlist);

  const all = useMemo(
    () => (cur.data ? describeElectives(cur.data.electives, units.data?.courses) : []),
    [cur.data, units.data]
  );
  // Maths heads-up only if maths has actually gone badly (pastRecord.ts).
  const mathsWeak = useMemo(() => isWeakArea(areaRecord(archives ?? [], "21MAB301T")), [archives]);
  const slots = useMemo(
    () =>
      (cur.data?.semesters ?? []).flatMap((s) =>
        s.courses.filter((c) => c.slot === kind).map((c) => ({ sem: s.n, title: c.title }))
      ),
    [cur.data, kind]
  );

  function toggleShortlist(code: string) {
    setShortlist((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
      try {
        localStorage.setItem(SHORTLIST_KEY, JSON.stringify(next));
      } catch {
        /* private mode: the shortlist lasts this visit */
      }
      return next;
    });
  }

  if (cur.isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!cur.data) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="px-1 text-2xl font-extrabold tracking-tight lg:text-3xl">Electives</h1>
        <section className="card">
          <EmptyState
            icon={Star}
            title="No curriculum yet"
            description="The electives come from your curriculum, which your Mac sends at its next sync."
            className="py-10"
          />
        </section>
      </div>
    );
  }

  const shown = all
    .filter((e) => e.kind === kind)
    .filter((e) => (theme === "all" ? true : theme === "shortlist" ? shortlist.includes(e.code) : e.theme === theme));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="px-1">
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Electives</h1>
        <p className="mt-1 text-sm font-medium text-muted">
          {kind === "E" ? "Professional" : "Open"} electives: {slots.length} to take ·{" "}
          {Object.entries(
            slots.reduce<Record<number, number>>((m, x) => ({ ...m, [x.sem]: (m[x.sem] ?? 0) + 1 }), {})
          )
            .map(([sem, n]) => `Sem ${sem}${n > 1 ? ` ×${n}` : ""}`)
            .join(", ")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["E", "O"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              "h-10 rounded-xl text-sm font-bold",
              kind === k ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted hover:text-ink"
            )}
          >
            {k === "E" ? "Professional" : "Open"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 px-1">
        {(["all", ...Object.keys(THEMES), "shortlist"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTheme(t as Theme | "all" | "shortlist")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-bold",
              theme === t ? "bg-ink text-bg" : "bg-surface-2 text-muted hover:text-ink"
            )}
          >
            {t === "all" ? "All" : t === "shortlist" ? `Shortlist (${shortlist.length})` : THEMES[t as Theme]}
          </button>
        ))}
      </div>

      <section className="card divide-y overflow-hidden p-0">
        {shown.length === 0 && (
          <p className="px-4 py-8 text-center text-sm font-medium text-muted">Nothing here yet.</p>
        )}
        {shown.map((e) => {
          const isOpen = open === e.code;
          const listed = shortlist.includes(e.code);
          const heavy = e.maths >= MATHS_HEAVY;
          return (
            <div key={e.code}>
              <div className="flex items-start gap-2 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : e.code)}
                  aria-expanded={isOpen}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block text-sm font-bold">{e.title}</span>
                  <span className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] font-medium text-muted">
                    <span>{THEMES[e.theme]}</span>
                    {heavy && (
                      <span className={cn("flex items-center gap-0.5 font-semibold", mathsWeak && "text-warn-deep")}>
                        · <Sigma className="h-3 w-3" /> maths-heavy
                      </span>
                    )}
                    {e.prerequisites && <span>· builds on {e.prerequisites}</span>}
                    {!e.hasSyllabus && <span>· no syllabus found</span>}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleShortlist(e.code)}
                  aria-pressed={listed}
                  aria-label={listed ? `Remove ${e.title} from shortlist` : `Shortlist ${e.title}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl hover:bg-surface-2"
                >
                  <Star className={cn("h-4 w-4", listed ? "fill-accent text-accent" : "text-muted")} />
                </button>
                <ChevronDown
                  className={cn("mt-2 h-4 w-4 shrink-0 text-muted transition-transform", isOpen && "rotate-180")}
                />
              </div>
              {isOpen && (
                <div className="space-y-2 px-4 pb-4">
                  {e.units.length > 0 && (
                    <ol className="space-y-0.5 text-xs font-medium">
                      {e.units.map((u, i) => (
                        <li key={i}>
                          <span className="font-bold text-muted">Unit {i + 1}</span> · {u}
                        </li>
                      ))}
                    </ol>
                  )}
                  {heavy && (
                    <p className="text-[11px] font-medium text-muted">
                      About {Math.round(e.maths * 100)}% of its syllabus topics are maths
                      {mathsWeak ? ", your hardest area so far: fine to pick, but budget time for it." : "."}
                    </p>
                  )}
                  <Link
                    to={`/subject/${e.code}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-accent"
                  >
                    Full syllabus <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </section>
      <p className="px-1 text-[11px] font-medium text-muted">
        Themes and "maths-heavy" are read from each syllabus's wording, a guide rather than a verdict. The shortlist stays
        on this device.
      </p>
    </div>
  );
}
