/**
 * The 4-digit PIN: the `device_id` that scopes every row in Supabase.
 *
 * An internal partition key, not a password or a sync code. It is claimed
 * by your account (device_owners), which is what the database checks, and
 * each signed-in device looks it up again — there is no screen to type it.
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

function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function generatePin(): string {
  const buf = new Uint16Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 10000).padStart(4, "0");
}
