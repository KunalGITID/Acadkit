/**
 * Saving a study file to the device.
 *
 * The old Download button was a link to a signed Supabase URL with a
 * `download` attribute. Safari on iOS ignores `download` on a link to
 * another origin, so it opened the file as a page, or - from the Home
 * Screen app - handed it to an in-app browser (which could still be showing
 * the last file) or asked to "Open in Files". Saving the bytes the app
 * already has avoids all of that:
 *
 * - iPhone / iPad: the share sheet, with "Save to Files" one tap away.
 *   share() only runs straight from a tap, so it's called synchronously.
 * - Everywhere else: a same-origin blob link, which `download` does
 *   apply to, carrying the file's real name.
 */

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  zip: "application/zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  txt: "text/plain",
  csv: "text/csv",
  md: "text/markdown",
};

/** The file's type, so the share sheet offers the right apps (stored blobs are named by hash). */
export function typeFor(name: string, fallback = ""): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return TYPES[ext] ?? (fallback || "application/octet-stream");
}

/** iPhone or iPad. iPadOS identifies as a Mac, so a Mac with a touchscreen counts. */
export function isAppleMobile(nav: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints"> = navigator): boolean {
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
}

/** Save `blob` as `name`. Call it directly from the tap's handler, with nothing awaited first. */
export function saveFile(blob: Blob, name: string): "share" | "download" {
  const file = new File([blob], name, { type: typeFor(name, blob.type) });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (isAppleMobile() && nav.canShare?.({ files: [file] })) {
    nav.share({ files: [file] }).catch((err: unknown) => {
      // Closing the sheet is a choice, not a failure; anything else falls back.
      if ((err as Error)?.name !== "AbortError") download(file, name);
    });
    return "share";
  }
  download(file, name);
  return "download";
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari reads the blob after click() returns; revoking at once can cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
