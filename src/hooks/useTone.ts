import { useAppStore } from "@/store/app";
import { toneFor, type Tone } from "@/lib/voice";

/** The copy register for the active theme. */
export function useTone(): Tone {
  return toneFor(useAppStore((s) => s.themeName));
}
