import { Check, Contrast, Sparkles, Zap } from "lucide-react";
import { useAppStore, type ThemeName } from "@/store/app";
import { cn, haptic } from "@/lib/utils";

const THEME_META: Record<
  ThemeName,
  {
    label: string;
    tagline: string;
    xFactor: string;
    icon: typeof Sparkles;
    swatch: { bg: string; accent: string; accent2: string };
  }
> = {
  brutalist: {
    label: "Brutalist",
    tagline: "Colour-blocked and loud",
    xFactor: "Oversized display numerals, flat blocks, a floating pill nav",
    icon: Zap,
    swatch: { bg: "hsl(0 0% 4%)", accent: "hsl(72 89% 60%)", accent2: "hsl(6 78% 62%)" },
  },
  oled: {
    label: "OLED",
    tagline: "True black, zero color",
    xFactor: "Pure #000 in dark mode — pixels off, not just dark",
    icon: Contrast,
    swatch: { bg: "hsl(0 0% 0%)", accent: "hsl(0 0% 38%)", accent2: "hsl(0 0% 58%)" },
  },
};

export function ThemePicker() {
  const themeName = useAppStore((s) => s.themeName);
  const setThemeName = useAppStore((s) => s.setThemeName);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {(Object.keys(THEME_META) as ThemeName[]).map((key) => {
        const meta = THEME_META[key];
        const active = themeName === key;
        return (
          <button
            key={key}
            onClick={() => {
              haptic();
              setThemeName(key);
            }}
            className={cn(
              "flex flex-col gap-3 rounded-3xl border p-4 text-left transition-all",
              active ? "border-accent bg-accent/[0.06] shadow-pop" : "hover:bg-surface-2/60"
            )}
          >
            <div
              className="flex h-16 items-center justify-center gap-2 rounded-2xl"
              style={{ background: meta.swatch.bg }}
            >
              <span
                className="h-3.5 w-3.5 rounded-full"
                style={{ background: meta.swatch.accent }}
              />
              <span
                className="h-3.5 w-3.5 rounded-full"
                style={{ background: meta.swatch.accent2 }}
              />
            </div>
            <div>
              <p className="flex items-center gap-1.5 font-bold">
                <meta.icon className="h-4 w-4 text-accent" />
                {meta.label}
                {active && <Check className="ml-auto h-4 w-4 text-accent" />}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-muted">{meta.tagline}</p>
              <p className="mt-1.5 text-[11px] leading-snug text-muted/80">{meta.xFactor}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Auto-marking is opt-in and reversible, and says exactly how many rows
 * it would write before it writes any of them. Inventing attendance
 * silently would be worse than the daily friction it removes.
 */