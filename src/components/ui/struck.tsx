import { useTone } from "@/hooks/useTone";
import { cn } from "@/lib/utils";

/** The correction: an official-sounding line crossed out, with the honest one underneath. */
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
