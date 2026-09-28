/**
 * Same-origin multi-tab sync: after any successful mutation, a tab
 * broadcasts which query keys changed; other tabs refetch them.
 */

const CHANNEL = "acadkit-sync";

type SyncMessage = { keys: string[] };

const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;

export function broadcastInvalidate(keys: string[]) {
  channel?.postMessage({ keys } satisfies SyncMessage);
}

export function onBroadcastInvalidate(handler: (keys: string[]) => void): () => void {
  if (!channel) return () => {};
  const listener = (e: MessageEvent<SyncMessage>) => handler(e.data.keys);
  channel.addEventListener("message", listener);
  return () => channel.removeEventListener("message", listener);
}
