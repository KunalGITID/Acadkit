import { useEffect, useRef } from "react";
import { useSettings, useUpdateSettings } from "@/hooks/useData";
import { useAppStore, type ColorMode } from "@/store/app";
import { isThemeName } from "@/lib/themes";

/**
 * Keeps the theme on the account rather than on the device.
 *
 * localStorage stays the source of truth for the *first* paint — the
 * inline script in index.html reads it before React exists, which is what
 * stops the app flashing the wrong palette on every load. The server copy
 * (migration 018) can't do that job; it arrives a network round-trip too
 * late. So this reconciles the two once the settings row lands.
 *
 * Direction is decided by one question: has this account ever chosen?
 *
 * - It has (`theme` is set) → adopt it. You picked OLED on your phone;
 *   opening the app on a laptop should not hand you the default back.
 * - It hasn't (`theme` is null) → publish what this device is already
 *   using, so the column fills itself for existing installs without
 *   anyone re-picking a theme they already picked.
 *
 * After that first reconciliation every local change is written up, and
 * because settings changes go out over realtime, switching theme on one
 * device moves the other one live.
 *
 * Two things make this harder than it reads, and both were caught by
 * pointing a device with one theme at an account holding another:
 *
 * 1. **The first settings row is not necessarily the account's.** The
 *    query cache is persisted to storage and `staleTime` is 30s, so on
 *    reload `data` is served from disk before any request goes out. That
 *    copy can predate what another device wrote. Adopting from it is
 *    adopting from yesterday, so this waits for `isFetchedAfterMount` —
 *    a row confirmed over the network *this* mount. A genuinely new
 *    device has no persisted cache and fetches immediately, which is the
 *    case that matters.
 *
 * 2. **Waiting must not revert a deliberate change.** If the user opens
 *    settings and picks a theme while that fetch is still in flight,
 *    adopting the server's answer would undo it seconds later. So a
 *    change made during this session outranks the account: it *is* the
 *    newest choice, and it publishes rather than adopts.
 */

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

  /**
   * Only the first reconciliation may overwrite the local choice.
   *
   * Without this the hook fights itself: a later change made on this
   * device would be reverted by whichever settings row is still sitting
   * in the cache.
   */
  const reconciled = useRef(false);

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
      update.mutate({ theme: themeName, theme_mode: themeMode });
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
