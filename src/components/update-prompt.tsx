import { useEffect, useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";

/**
 * How long after the app comes to the foreground an update may still be
 * applied without asking. Inside this window nobody has started typing
 * yet, so a reload costs nothing; after it, the toast asks first.
 */
const FRESH_MS = 10_000;
const HOURLY = 60 * 60 * 1000;

/**
 * Keeps the installed app current.
 *
 * The browser only checks sw.js for a new version on a navigation, and a
 * home-screen app on iOS is resumed from the background, not navigated —
 * so without an explicit `update()` a release could sit undiscovered for
 * weeks, and the only way to get it was deleting and re-adding the app.
 * Checking on every return to the foreground (and hourly while open)
 * finds a release the first time the app is opened after it ships.
 */
export function UpdatePrompt() {
  const foregroundAt = useRef(Date.now());
  // An update dismissed earlier is already installed and waiting, so the
  // next update() finds nothing new and needRefresh never fires again.
  // Opening the app applies it instead — through this ref, because the
  // registration callback runs before the hook has returned.
  const apply = useRef<() => void>(() => {});

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {});
      };
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") return;
        foregroundAt.current = Date.now();
        if (registration.waiting) apply.current();
        else check();
      });
      setInterval(check, HOURLY);
    },
  });

  apply.current = () => void updateServiceWorker(true);

  useEffect(() => {
    if (!needRefresh) return;
    if (Date.now() - foregroundAt.current < FRESH_MS) {
      void updateServiceWorker(true);
      return;
    }
    // One line, not two: the action says what happens, so a description
    // repeating it only makes the toast taller on the screen where
    // there's least room for it.
    toast("Update available", {
      duration: Infinity,
      action: {
        label: "Reload",
        onClick: () => void updateServiceWorker(true),
      },
      onDismiss: () => setNeedRefresh(false),
    });
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  return null;
}
