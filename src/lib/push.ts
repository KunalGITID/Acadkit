/**
 * Web Push client helpers. The VAPID public key is safe to embed; the
 * matching private key lives only as a Supabase Edge Function secret.
 */
export const VAPID_PUBLIC_KEY =
  "BBPr8Odr2qN7A9q-IqeNs3N_Pj1E_qnMOl-b6mhSG51wH6_JUl-5r3VoFyeAQ2EGbUAdqwjNBfq7bizwMyp6iQQ";

export const pushSupported =
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

function toJson(sub: PushSubscription): PushSub {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
  };
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Ask permission + subscribe. Returns the serializable subscription. */
export async function subscribeToPush(): Promise<PushSub> {
  if (!pushSupported) throw new Error("Push isn't supported on this device/browser");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications permission was denied");

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));
  return toJson(sub);
}

export async function unsubscribeFromPush(): Promise<string | null> {
  const sub = await getExistingSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
