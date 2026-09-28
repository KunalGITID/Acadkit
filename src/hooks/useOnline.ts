import { useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";

/** Live online/offline status, driven by React Query's onlineManager. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true
  );
}
