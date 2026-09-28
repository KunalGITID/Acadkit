import { useEffect, useRef, useState } from "react";
import { ownedDevices } from "@/lib/auth";
import { chooseDevice } from "@/lib/devices";
import { useAppStore } from "@/store/app";

export interface AutoDeviceState {
  /**
   * True once the account's claimed PINs have been looked up - settled,
   * not necessarily successful. `App` waits on this before deciding a
   * signed-in user with no PIN is somebody with no account.
   */
  resolved: boolean;
}

/** Reconcile the local PIN against what the account actually owns. */
export function useAutoDevice(enabled: boolean): AutoDeviceState {
  const pin = useAppStore((s) => s.pin);
  const setPin = useAppStore((s) => s.setPin);
  const tried = useRef(false);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    /** Signing out clears the PIN but doesn't unmount App, so a guard that only knows "already ran once" would sit out the *next* sign-in entirely - leaving the second account with no PIN, on onboarding, being offered a brand-new one while its real data sat under the PIN nobody looked up. */
    if (!enabled) {
      tried.current = false;
      setResolved(false);
      return;
    }
    if (tried.current) return;
    tried.current = true;

    void ownedDevices()
      .then((devices) => {
        const next = chooseDevice(pin, devices);
        if (next && next !== pin) setPin(next);
      })
      .catch(() => {})
      // Settled either way: a lookup that failed has still had its go,
      // and onboarding is a better answer than holding a blank screen.
      .finally(() => setResolved(true));
  }, [enabled, pin, setPin]);

  return { resolved };
}
