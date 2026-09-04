import type { Grade } from "@/lib/grades";

/**
 * A shareable summary image.
 *
 * The data shape is separated from the drawing so the interesting part —
 * what gets included, how it's truncated, how a missing SGPA reads — is
 * testable without a canvas.
 */

export interface ShareRow {
  code: string;
  grade: Grade;
  color: string;
}

export interface ShareData {
  title: string;
  sgpa: string;
  sgpaLabel: string;
  attendance: string;
  attendanceLabel: string;
  rows: ShareRow[];
  footer: string;
}

/** At most this many subject chips fit the card without crowding. */
const MAX_ROWS = 8;

export function buildShareData(input: {
  name?: string | null;
  semester?: number | null;
  sgpa: number | null;
  attendancePct: number | null;
  subjects: Array<{ code: string; grade: Grade; color: string; hasMarks: boolean }>;
  date?: Date;
}): ShareData {
  const date = input.date ?? new Date();
  const rows = input.subjects
    .filter((s) => s.hasMarks)
    .slice(0, MAX_ROWS)
    .map(({ code, grade, color }) => ({ code, grade, color }));

  return {
    title: input.name ? `${input.name}'s semester` : "My semester",
    sgpa: input.sgpa === null ? "—" : input.sgpa.toFixed(2),
    sgpaLabel: input.sgpa === null ? "no marks yet" : "predicted SGPA",
    attendance:
      input.attendancePct === null ? "—" : `${Math.round(input.attendancePct)}%`,
    attendanceLabel: "attendance",
    rows,
    footer: `${input.semester ? `Semester ${input.semester} · ` : ""}${date.toLocaleDateString(
      "en-GB",
      { day: "numeric", month: "short", year: "numeric" }
    )} · AcadKit`,
  };
}

const W = 1080;
const H = 1350;

/** Rounded rect path — Safari lacks roundRect on older versions. */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw the card and hand back a PNG blob. */
export async function renderShareCard(data: ShareData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable on this device");

  ctx.fillStyle = "#0b0b0f";
  ctx.fillRect(0, 0, W, H);

  // A soft accent wash so the card isn't a flat rectangle.
  const glow = ctx.createRadialGradient(W * 0.8, 120, 0, W * 0.8, 120, 720);
  glow.addColorStop(0, "rgba(124,106,247,0.30)");
  glow.addColorStop(1, "rgba(124,106,247,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const sans = "system-ui, -apple-system, 'Segoe UI', sans-serif";

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 44px ${sans}`;
  ctx.fillText(data.title, 80, 150);

  // SGPA — the hero number.
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 260px ${sans}`;
  ctx.fillText(data.sgpa, 80, 420);
  ctx.fillStyle = "#9ca3af";
  ctx.font = `600 38px ${sans}`;
  ctx.fillText(data.sgpaLabel, 84, 480);

  // Attendance beside it.
  ctx.fillStyle = "#4ade80";
  ctx.font = `800 110px ${sans}`;
  ctx.fillText(data.attendance, 80, 640);
  ctx.fillStyle = "#9ca3af";
  ctx.font = `600 38px ${sans}`;
  ctx.fillText(data.attendanceLabel, 84, 694);

  // Subject chips.
  let y = 790;
  for (const row of data.rows) {
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    roundRect(ctx, 80, y, W - 160, 62, 20);
    ctx.fill();

    ctx.fillStyle = row.color;
    ctx.beginPath();
    ctx.arc(120, y + 31, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#e5e7eb";
    ctx.font = `600 32px ${sans}`;
    ctx.fillText(row.code, 152, y + 43);

    ctx.fillStyle = "#ffffff";
    ctx.font = `800 32px ${sans}`;
    ctx.textAlign = "right";
    ctx.fillText(row.grade, W - 112, y + 43);
    ctx.textAlign = "left";

    y += 74;
  }

  ctx.fillStyle = "#6b7280";
  ctx.font = `600 28px ${sans}`;
  ctx.fillText(data.footer, 80, H - 70);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't render the image"))),
      "image/png"
    )
  );
}

/**
 * Share natively where possible, otherwise fall back to a download.
 * Returns how it was delivered so the caller can word the toast.
 */
export async function shareCard(blob: Blob, filename: string): Promise<"shared" | "saved"> {
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
  };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (err) {
      // A user-cancelled share is not a failure worth reporting as one.
      if ((err as Error)?.name === "AbortError") return "shared";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return "saved";
}

// ---------------------------------------------------------------------
// Survival plan card
// ---------------------------------------------------------------------

export interface SurvivalShare {
  headline: string;
  freeDays: string[];
  deadline: string | null;
  lost: string[];
  footer: string;
}

/**
 * The plan is more shareable than a grade. "here are the 3 days I can
 * skip in September" is a thing people actually send each other; an SGPA
 * is a thing people screenshot once.
 */
export async function renderSurvivalCard(data: SurvivalShare): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable on this device");

  ctx.fillStyle = "#0b0b0f";
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.2, 90, 0, W * 0.2, 90, 700);
  glow.addColorStop(0, "rgba(212,245,69,0.22)");
  glow.addColorStop(1, "rgba(212,245,69,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const sans = "system-ui, -apple-system, 'Segoe UI', sans-serif";

  ctx.fillStyle = "#d4f545";
  ctx.font = `700 40px ${sans}`;
  ctx.fillText("survival plan", 80, 140);

  ctx.fillStyle = "#ffffff";
  ctx.font = `800 76px ${sans}`;
  wrap(ctx, data.headline, 80, 250, W - 160, 84);

  let y = 470;
  if (data.deadline) {
    ctx.fillStyle = "#facc15";
    ctx.font = `700 34px ${sans}`;
    wrap(ctx, data.deadline, 80, y, W - 160, 44);
    y += 110;
  }

  if (data.freeDays.length) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = `600 28px ${sans}`;
    ctx.fillText("days off left", 80, y);
    y += 56;
    ctx.fillStyle = "#4ade80";
    ctx.font = `800 44px ${sans}`;
    // Only what fits; the count in the headline carries the rest.
    ctx.fillText(data.freeDays.slice(0, 6).join("  ·  "), 80, y);
    y += 96;
  }

  if (data.lost.length) {
    ctx.fillStyle = "#fb7185";
    ctx.font = `700 30px ${sans}`;
    wrap(ctx, `already gone: ${data.lost.join(", ")}`, 80, y, W - 160, 40);
  }

  ctx.fillStyle = "#6b7280";
  ctx.font = `600 28px ${sans}`;
  ctx.fillText(data.footer, 80, H - 70);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't render the image"))),
      "image/png"
    )
  );
}

/** Break `text` to `maxWidth`, drawing each line `lineHeight` apart. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  let line = "";
  for (const word of text.split(" ")) {
    const attempt = line ? `${line} ${word}` : word;
    if (ctx.measureText(attempt).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = word;
    } else {
      line = attempt;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

// ---------------------------------------------------------------------
// Wrapped card
// ---------------------------------------------------------------------

export interface WrappedShareStat {
  value: string;
  label: string;
  /** Accent for the value. Defaults to white. */
  color?: string;
}

export interface WrappedShare {
  title: string;
  /** The single biggest number, given the top third of the card. */
  heroValue: string;
  heroLabel: string;
  /** Up to four supporting figures, drawn as a 2×2 grid. */
  stats: WrappedShareStat[];
  footer: string;
}

/**
 * The Wrapped card.
 *
 * A separate renderer from `renderShareCard` rather than a variant of
 * it, because the two say different things: that one is a report (a
 * grade per subject, uniform rows), this one is a boast (one enormous
 * number and a few supporting figures). Trying to serve both from one
 * layout produced a card that was neither.
 *
 * Stats are capped at four. A grid of eight is a spreadsheet, and the
 * whole point of the format is that it can be read at thumbnail size.
 */
export async function renderWrappedCard(data: WrappedShare): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable on this device");

  const sans = "system-ui, -apple-system, 'Segoe UI', sans-serif";

  ctx.fillStyle = "#07070a";
  ctx.fillRect(0, 0, W, H);

  // Two washes rather than one, so the hero number sits in light and the
  // stat grid below it falls away.
  const top = ctx.createRadialGradient(W * 0.25, 260, 0, W * 0.25, 260, 900);
  top.addColorStop(0, "rgba(190,242,100,0.22)");
  top.addColorStop(1, "rgba(190,242,100,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, H);

  const bottom = ctx.createRadialGradient(W * 0.85, H - 200, 0, W * 0.85, H - 200, 760);
  bottom.addColorStop(0, "rgba(124,106,247,0.20)");
  bottom.addColorStop(1, "rgba(124,106,247,0)");
  ctx.fillStyle = bottom;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#9ca3af";
  ctx.font = `700 36px ${sans}`;
  ctx.fillText(data.title.toUpperCase(), 80, 140);

  // Hero number, sized to fit rather than trusted to. A four-digit hour
  // count would otherwise run off the edge of the card.
  let heroSize = 300;
  ctx.font = `800 ${heroSize}px ${sans}`;
  while (ctx.measureText(data.heroValue).width > W - 160 && heroSize > 120) {
    heroSize -= 10;
    ctx.font = `800 ${heroSize}px ${sans}`;
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillText(data.heroValue, 80, 440);

  ctx.fillStyle = "#bef264";
  ctx.font = `700 44px ${sans}`;
  wrap(ctx, data.heroLabel, 84, 520, W - 200, 56);

  // 2×2 grid of supporting figures.
  const cellW = (W - 160 - 32) / 2;
  const cellH = 210;
  data.stats.slice(0, 4).forEach((stat, i) => {
    const x = 80 + (i % 2) * (cellW + 32);
    const y = 660 + Math.floor(i / 2) * (cellH + 32);

    ctx.fillStyle = "rgba(255,255,255,0.05)";
    roundRect(ctx, x, y, cellW, cellH, 28);
    ctx.fill();

    ctx.fillStyle = stat.color ?? "#ffffff";
    ctx.font = `800 76px ${sans}`;
    ctx.fillText(stat.value, x + 32, y + 106);

    ctx.fillStyle = "#9ca3af";
    ctx.font = `600 28px ${sans}`;
    wrap(ctx, stat.label, x + 32, y + 152, cellW - 64, 34);
  });

  ctx.fillStyle = "#6b7280";
  ctx.font = `600 28px ${sans}`;
  ctx.fillText(data.footer, 80, H - 70);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't render the image"))),
      "image/png"
    )
  );
}
