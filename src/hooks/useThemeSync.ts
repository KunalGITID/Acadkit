import { useEffect, useRef } from "react";
import { useSettings, useUpdateSettings } from "@/hooks/useData";
import { useAppStore, type ColorMode } from "@/store/app";
import { isThemeName } from "@/lib/themes";

/** Keeps the theme on the account rather than on the device. */

const MODES: ColorMode[] = ["light", "dark", "system"];
const isColorMode = (v: unknown): v is ColorMode =>
  typeof v === "string" && (MODES as string[]).includes(v);

export function useThemeSync() {
  const { data: settings, isFetchedAfterMount } = useSettings();
  const update = useUpdateSettings();

  const themeName = useAppStore((s) => s.themeName);
  const themeMode = useAppStore((s) => s.themeMode);
  const setThemeName = useAppStore((s) => s.setThemeName);
  const setThemeMode = useAppStore((s) => s.setThemeMode);

  /** What the device was using before the user touched anything. */
  const atMount = useRef({ name: themeName, mode: themeMode });
  const pickedThisSession =
    themeName !== atMount.current.name || themeMode !== atMount.current.mode;

  /** Only the first reconciliation may overwrite the local choice. */
  const reconciled = useRef(false);

  /** The last theme this hook actually published. */
  const published = useRef<string | null>(null);

  useEffect(() => {
    if (!settings) return;

    if (!reconciled.current) {
      // A row off the disk cache can be older than the account. Hold,
      // unless the user has just made a choice that outranks it anyway.
      if (!isFetchedAfterMount && !pickedThisSession) return;
      reconciled.current = true;

      if (!pickedThisSession) {
        const storedName = isThemeName(settings.theme) ? settings.theme : null;
        const storedMode = isColorMode(settings.theme_mode) ? settings.theme_mode : null;
        if (storedName || storedMode) {
          if (storedName && storedName !== themeName) setThemeName(storedName);
          if (storedMode && storedMode !== themeMode) setThemeMode(storedMode);
          return;
        }
        // Nothing stored: fall through and publish this device's choice.
      }
    }

    if (settings.theme !== themeName || settings.theme_mode !== themeMode) {
      const pair = `${themeName}|${themeMode}`;
      if (published.current !== pair) {
        published.current = pair;
        update.mutate({ theme: themeName, theme_mode: themeMode });
      }
    }
    // `update` is a stable mutation object; including it would re-run this
    // on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings,
    isFetchedAfterMount,
    pickedThisSession,
    themeName,
    themeMode,
    setThemeName,
    setThemeMode,
  ]);
}
