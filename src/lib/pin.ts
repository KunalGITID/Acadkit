/**
 * Identity = a 4-digit PIN stored locally. It is the `device_id` that
 * scopes every row in Supabase, and doubles as the cross-device sync
 * code: enter the same PIN anywhere to load the same data.
 */

const PIN_KEY = "acadkit:pin";

export function getStoredPin(): string | null {
  const pin = localStorage.getItem(PIN_KEY);
  return pin && isValidPin(pin) ? pin : null;
}

export function storePin(pin: string): void {
  localStorage.setItem(PIN_KEY, pin);
}

export function clearPin(): void {
  localStorage.removeItem(PIN_KEY);
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function generatePin(): string {
  const buf = new Uint16Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 10000).padStart(4, "0");
}
