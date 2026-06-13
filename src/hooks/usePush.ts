import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getExistingSubscription,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";
import { deletePushSubscription, savePushSubscription } from "@/api/queries";
import { usePin } from "@/hooks/useData";

export function usePush() {
  const pin = usePin();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void getExistingSubscription().then((s) => {
      if (alive) setSubscribed(!!s);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const sub = await subscribeToPush();
      await savePushSubscription(pin, sub);
      setSubscribed(true);
      toast.success("Reminders on", {
        description: "Class, deadline and attendance nudges will arrive here.",
      });
    } catch (err) {
      toast.error("Couldn't turn on notifications", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const endpoint = await unsubscribeFromPush();
      if (endpoint) await deletePushSubscription(endpoint);
      setSubscribed(false);
      toast.success("Reminders off");
    } catch (err) {
      toast.error("Couldn't turn off notifications", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  const permission =
    typeof Notification !== "undefined" ? Notification.permission : "default";

  return { supported: pushSupported, subscribed, busy, permission, enable, disable };
}
