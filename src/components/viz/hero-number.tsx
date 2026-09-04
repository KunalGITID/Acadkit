import { cn } from "@/lib/utils";
import { useTone } from "@/hooks/useTone";

/**
 * The oversized numeral from the reference — a `04` big enough to run
 * off the edge, with the label set beside it rather than under it.
 *
 * Only the Brutalist register gets it. In the plain theme the same data
 * renders as an ordinary stat, because a number cropped by the viewport
 * is a stylistic claim, not an improvement.
 *
 * The digits are `overflow-hidden` at the block level and deliberately
 * allowed to bleed: `leading-[0.78]` crops the ascender space so the
 * glyphs sit tight against the top edge, which is what makes it read as
 * a poster rather than a large font-size.
 */
export function HeroNumber({
  value,
  label,
  caption,
  tone: colour = "default",
  className,
}: {
  /** Short — two or three glyphs. "04", "36%", "8.65". */
  value: string;
  label: string;
  caption?: string;
  tone?: "default" | "good" | "bad";
  className?: string;
}) {
  const voice = useTone();

  if (voice !== "brutal") {
    return (
      <div className={className}>
        <p className="text-4xl font-extrabold tabular">{value}</p>
        <p className="text-xs font-bold uppercase tracking-widest text-muted">{label}</p>
        {caption && <p className="mt-0.5 text-xs text-muted">{caption}</p>}
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div className="flex items-end gap-4">
        <span
          className={cn(
            "tabular block shrink-0 font-extrabold leading-[0.78] tracking-[-0.06em]",
            "text-[clamp(4.5rem,22vw,9rem)]",
            colour === "good" && "text-good-deep",
            colour === "bad" && "text-bad-deep"
          )}
        >
          {value}
        </span>
        <div className="min-w-0 flex-1 pb-2">
          <p className="text-xs font-bold tracking-[0.22em] text-muted">{label}</p>
          {caption && (
            <p className="mt-1 text-sm font-semibold leading-snug">{caption}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A full-bleed colour block — the red "holiday" panel and the lime
 * "you're doing well" panel from the reference.
 *
 * Bleeds past the page's horizontal padding with negative margins so the
 * colour reaches the screen edge, which is the whole point of a block;
 * a colour panel inset by 16px reads as a card that happens to be
 * coloured. Plain register gets an ordinary card instead.
 */
export function ColourBlock({
  tone: colour,
  children,
  className,
}: {
  tone: "accent" | "bad" | "good";
  children: React.ReactNode;
  className?: string;
}) {
  const voice = useTone();

  if (voice !== "brutal") {
    return <section className={cn("card p-5", className)}>{children}</section>;
  }

  return (
    <section
      className={cn(
        // -mx-4 cancels the shell's px-4; lg keeps it inside the column,
        // where a true bleed would fight the sidebar.
        "-mx-4 px-5 py-6 lg:mx-0 lg:rounded-[28px]",
        colour === "accent" && "bg-accent text-[hsl(0_0%_6%)]",
        colour === "bad" && "bg-bad-deep text-white",
        colour === "good" && "bg-good-deep text-white",
        className
      )}
    >
      {children}
    </section>
  );
}
