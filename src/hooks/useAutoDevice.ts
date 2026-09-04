import { useEffect, useRef } from "react";
import { ownedDevices } from "@/lib/auth";
import { useAppStore } from "@/store/app";

/**
 * Skip onboarding when the account already owns exactly one PIN.
 *
 * This is what makes signing in *faster* than the PIN-only flow it
 * replaces: after the one-time sign-in, a new device opens straight to
 * your data instead of asking you to remember four digits. With more
 * than one claimed PIN it stays out of the way and lets you choose.
 */
export function useAutoDevice(enabled: boolean): void {
  const pin = useAppStore((s) => s.pin);
  const setPin = useAppStore((s) => s.setPin);
  const tried = useRef(false);

  useEffect(() => {
    if (!enabled || pin || tried.current) return;
    tried.current = true;
    void ownedDevices()
      .then((devices) => {
        if (devices.length === 1) setPin(devices[0]);
      })
      // Offline, or the table isn't there yet — fall through to
      // onboarding rather than blocking on it.
      .catch(() => {});
  }, [enabled, pin, setPin]);
}
