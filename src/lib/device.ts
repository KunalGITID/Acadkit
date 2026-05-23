const DEVICE_KEY = "acadkit_device_id";

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = generatePin();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function setSyncPin(pin: string): void {
  localStorage.setItem(DEVICE_KEY, pin);
}
