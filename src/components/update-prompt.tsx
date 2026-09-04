import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";

/** Surfaces a "new version" toast when the service worker has an update ready. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!needRefresh) return;
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
