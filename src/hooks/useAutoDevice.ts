import { useEffect, useRef } from "react";
import { ownedDevices } from "@/lib/auth";
import { chooseDevice } from "@/lib/devices";
import { useAppStore } from "@/store/app";

/**
 * Reconcile the local PIN against what the account actually owns.
 *
 * The PIN is an internal partition key now, not something you manage —
 * there is no UI left to type or change one. That makes a stale value a
 * trap: a device carrying a PIN this account doesn't own would show an
 * empty app with no way to fix it. So this doesn't merely fill an empty
 * slot, it replaces a PIN that isn't ours.
 *
 * Only ever acts on a successful lookup. Offline, or mid-outage, the
 * stored PIN is left alone rather than cleared — showing cached data
 * beats showing nothing.
 */
export function useAutoDevice(enabled: boolean): void {
  const pin = useAppStore((s) => s.pin);
  const setPin = useAppStore((s) => s.setPin);
  const tried = useRef(false);

  useEffect(() => {
    if (!enabled || tried.current) return;
    tried.current = true;

    void ownedDevices()
      .then((devices) => {
        const next = chooseDevice(pin, devices);
        if (next && next !== pin) setPin(next);
      })
      .catch(() => {});
  }, [enabled, pin, setPin]);
}
