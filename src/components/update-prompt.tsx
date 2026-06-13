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
    toast("AcadKit just got an update", {
      description: "Reload to get the latest version.",
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
