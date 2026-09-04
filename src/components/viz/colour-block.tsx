import { cn } from "@/lib/utils";
import { useTone } from "@/hooks/useTone";

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
