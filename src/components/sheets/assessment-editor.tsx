import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { inferType } from "@/lib/plan";
import { cn } from "@/lib/utils";
import type { Assessment, PlannedComponent } from "@/types";

/**
 * The internal/external split, and the components that make up the
 * internal half.
 *
 * Both halves are optional on purpose. SRM faculty hand out the
 * breakdown whenever they feel like it — some in week one, some the
 * week before the test — so a subject with an empty component list is
 * the normal starting state, not an unfinished one. Whatever weight
 * nobody has claimed stays an open bucket on the Insights card and
 * shrinks as rows get added, which means adding a test the moment it's
 * announced is worth doing and never required.
 */

const PRESETS: Array<{ label: string; internal: number }> = [
  { label: "60 / 40", internal: 60 },
  { label: "50 / 50", internal: 50 },
  { label: "70 / 30", internal: 70 },
  { label: "All internal", internal: 100 },
];

const newKey = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function AssessmentEditor({
  value,
  onChange,
}: {
  value: Assessment;
  onChange: (next: Assessment) => void;
}) {
  const planned = value.components.reduce((s, c) => s + (Number(c.max) || 0), 0);
  const unclaimed = value.internal - planned;
  const external = 100 - value.internal;

  const set = (patch: Partial<Assessment>) => onChange({ ...value, ...patch });
  const setRow = (i: number, patch: Partial<PlannedComponent>) =>
    set({ components: value.components.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => set({ internal: p.internal })}
            aria-pressed={value.internal === p.internal}
            className={cn(
              "h-9 rounded-xl px-3 text-xs font-bold transition-all",
              value.internal === p.internal
                ? "bg-accent/15 text-accent ring-1.5 ring-inset ring-accent"
                : "bg-surface-2 text-muted"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          aria-label="Internal weight"
          value={String(value.internal)}
          onChange={(e) =>
            set({ internal: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
          }
          className="h-10 w-20 rounded-xl text-center text-sm"
        />
        <span>
          internal · <b className="tabular text-ink">{external}</b> end sem
        </span>
      </div>

      {value.internal > 0 && (
        <div className="space-y-2 rounded-2xl bg-surface-2/40 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
            Components — add them as they're announced
          </p>

          {value.components.map((c, i) => (
            <div key={c.key} className="flex items-center gap-2">
              <Input
                value={c.label}
                placeholder="CT-1"
                aria-label={`Component ${i + 1} name`}
                onChange={(e) =>
                  setRow(i, { label: e.target.value, type: inferType(e.target.value) })
                }
                className="h-10 flex-1 rounded-xl text-sm"
              />
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                aria-label={`Component ${i + 1} marks`}
                value={String(c.max)}
                onChange={(e) => setRow(i, { max: Math.max(0, Number(e.target.value) || 0) })}
                className="h-10 w-16 rounded-xl text-center text-sm"
              />
              <button
                type="button"
                aria-label={`Remove ${c.label || "component"}`}
                onClick={() => set({ components: value.components.filter((_, idx) => idx !== i) })}
                className="grid h-10 w-9 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:text-bad-deep"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              set({
                components: [
                  ...value.components,
                  {
                    key: newKey(),
                    label: "",
                    type: "CT",
                    max: Math.max(0, Math.min(15, unclaimed)),
                  },
                ],
              })
            }
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed text-xs font-bold text-muted transition-colors hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" /> Add component
          </button>

          <p className="px-1 text-[11px] font-medium text-muted">
            planned <b className="tabular text-ink">{planned}</b> / {value.internal}
            {unclaimed > 0 && (
              <>
                {" "}
                · <b className="tabular">{unclaimed}</b> still unannounced
              </>
            )}
            {unclaimed < 0 && (
              <span className="text-bad-deep">
                {" "}
                · {-unclaimed} over — everything will be scaled to fit
              </span>
            )}
          </p>

          {value.components.length > 0 && unclaimed !== 0 && (
            <label className="flex items-start gap-2 px-1 text-[11px] font-medium text-muted">
              <input
                type="checkbox"
                checked={value.complete}
                onChange={(e) => set({ complete: e.target.checked })}
                className="mt-0.5 h-3.5 w-3.5 accent-[hsl(var(--accent))]"
              />
              <span>
                That's the full breakdown — scale these onto {value.internal} rather than leaving
                marks unaccounted for.
              </span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
