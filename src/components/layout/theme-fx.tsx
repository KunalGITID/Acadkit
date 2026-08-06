import { useAppStore } from "@/store/app";

/**
 * Renders each theme's signature background/overlay effect. Mounted once
 * at the app root so it applies everywhere, including Onboarding.
 * Purely decorative: aria-hidden and pointer-events-none throughout.
 */
export function ThemeFx() {
  const themeName = useAppStore((s) => s.themeName);

  if (themeName === "sakura") return <div className="fx-grain" aria-hidden />;
  if (themeName === "terminal") return <div className="fx-scanline" aria-hidden />;
  if (themeName === "aurora") return <div className="fx-aurora" aria-hidden />;
  return null;
}
