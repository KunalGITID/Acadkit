import { useTone } from "@/hooks/useTone";
import { cn } from "@/lib/utils";

/**
 * The correction: an official-sounding line crossed out, with the honest
 * one underneath.
 *
 * ~~welcome back, scholar~~
 * ugh, another day of suffering
 *
 * This is the one part of the Brutalist voice a string swap can't do —
 * both versions have to be on screen at once, which needs markup. In the
 * plain register there is nothing to correct, so only `honest` renders
 * and no extra element is produced.
 *
 * The struck line is aria-hidden: a screen reader announcing a sentence
 * and then contradicting it is a joke that doesn't survive being read
 * aloud.
 */
export function Struck({
  official,
  honest,
  className,
}: {
  official: string;
  honest: React.ReactNode;
  className?: string;
}) {
  const tone = useTone();

  if (tone !== "brutal") return <>{honest}</>;

  return (
    <span className={cn("block", className)}>
      <span
        aria-hidden
        className="block text-[0.7em] font-semibold leading-tight text-bad-deep/70 line-through decoration-[1.5px]"
      >
        {official}
      </span>
      <span className="block">{honest}</span>
    </span>
  );
}
