export const DAY_ORDERS = [1, 2, 3, 4, 5];
export const DAY_ORDER_LABELS = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5"];

export const SUBJECT_COLORS = [
  "#7c6af7",
  "#f97316",
  "#22d3ee",
  "#4ade80",
  "#f472b6",
  "#facc15",
  "#fb7185",
  "#a78bfa",
  "#38bdf8",
  "#e879f9",
];

export const COLLEGE_START = "08:00";
export const COLLEGE_END = "17:00";

export function generateTimeOptions(): string[] {
  const times: string[] = [];
  for (let h = 8; h <= 17; h++) {
    for (let m = 0; m < 60; m += 5) {
      if (h === 17 && m > 0) break;
      times.push(
        `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
      );
    }
  }
  return times;
}

export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export function formatDuration(start: string, end: string): string {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  return `${mins} min`;
}

export function isSlotActive(start: string, end: string): boolean {
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return current >= sh * 60 + sm && current < eh * 60 + em;
}

export function isSlotPast(end: string): boolean {
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const [eh, em] = end.split(":").map(Number);
  return current >= eh * 60 + em;
}

export function normalizeTime(time: string): string {
  return time.slice(0, 5);
}

export function timeToMinutes(time: string): number {
  const [h, m] = normalizeTime(time).split(":").map(Number);
  return h * 60 + m;
}

export function addMinutesToTime(time: string, minutes: number): string {
  const total = timeToMinutes(time) + minutes;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function slotsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  const a0 = timeToMinutes(aStart);
  const a1 = timeToMinutes(aEnd);
  const b0 = timeToMinutes(bStart);
  const b1 = timeToMinutes(bEnd);
  return a0 < b1 && b0 < a1;
}
