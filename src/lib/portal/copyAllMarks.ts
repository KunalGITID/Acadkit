// "Copy all marks": a bookmarklet for sp.srmist.edu.in's Internal Mark
// Details page. It opens each subject's View Details popup in turn (clicking
// is the only way in - see scripts/portal-sync), writes every component as
// one line, and puts the lot on the clipboard for AcadKit's paste box
// (lib/portal/marksPaste.ts reads it). It holds no PIN or token and sends
// nothing anywhere: the copy is the whole of what it does.
//
// The function below is serialised with toString() into the bookmark, so it
// must be self-contained: no imports, no outer variables.

export async function copyAllMarks(): Promise<string | null> {
  const HEADER = "AcadKit marks v1"; // = COPY_HEADER in marksPaste.ts (a test holds them together)
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
  const isOpen = (el: Element) => /(^|\s)(show|in)(\s|$)/.test(el.className || "");

  const box = document.createElement("div");
  box.setAttribute(
    "style",
    "position:fixed;z-index:2147483647;left:50%;top:16px;transform:translateX(-50%);background:#111;color:#fff;" +
      "font:600 14px/1.4 system-ui,sans-serif;padding:14px 16px;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.4);" +
      "max-width:92vw;text-align:center"
  );
  document.body.appendChild(box);
  const say = (t: string) => {
    box.textContent = t;
  };

  const buttons = Array.from(document.querySelectorAll<HTMLElement>("button[onclick*='ComponentWiseMarks']"));
  if (!buttons.length) {
    say("AcadKit: open Grade / Mark & Credit → Internal Mark Details on the portal, then tap this again.");
    setTimeout(() => box.remove(), 7000);
    return null;
  }

  const lines = [HEADER];
  let prev = "";
  let skipped = 0;
  for (let i = 0; i < buttons.length; i++) {
    const code = norm(buttons[i].closest("tr")?.querySelector("td")?.textContent).toUpperCase();
    say(`AcadKit: reading ${code} (${i + 1} of ${buttons.length})…`);
    buttons[i].click();

    // Wait for the popup to show this subject (its title changes with it).
    let modal: Element | null = null;
    for (let t = 0; t < 24 && !modal; t++) {
      for (const m of Array.from(document.querySelectorAll(".modal"))) {
        const text = norm(m.textContent);
        if (isOpen(m) && /component/i.test(text) && text !== prev) {
          modal = m;
          prev = text;
          break;
        }
      }
      if (!modal) await sleep(250);
    }

    const table = modal?.querySelector("table");
    if (table) {
      const heads = Array.from(table.querySelectorAll("th")).map((th) => norm(th.textContent).toLowerCase());
      const iComp = heads.findIndex((h) => /component/.test(h));
      const iPair = heads.findIndex((h) => /mark\s*\/\s*max/.test(h));
      for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
        const cells = Array.from((row as HTMLTableRowElement).cells).map((c) => norm(c.textContent));
        const pair = /^(Abs(?:ent)?|\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/i.exec(cells[iPair] ?? "");
        if (iComp >= 0 && cells[iComp] && pair) lines.push([code, cells[iComp], pair[1], pair[2]].join("\t"));
      }
    } else {
      skipped++;
    }
    document
      .querySelector<HTMLElement>(".modal.show [data-dismiss='modal'], .modal.show [data-bs-dismiss='modal'], .modal.in [data-dismiss='modal']")
      ?.click();
    await sleep(450);
  }

  const text = lines.join("\n");
  const count = lines.length - 1;
  // The clicks took a few seconds, so the tap that started this no longer
  // counts as permission to write the clipboard: ask for one more tap.
  box.textContent = "";
  const p = document.createElement("p");
  p.textContent = `AcadKit: ${count} marks from ${buttons.length - skipped} subjects${skipped ? ` (${skipped} didn't open)` : ""}.`;
  const copy = document.createElement("button");
  copy.textContent = "Copy for AcadKit";
  copy.setAttribute("style", "margin-top:10px;padding:10px 18px;border-radius:10px;border:0;background:#4ade80;color:#111;font:800 15px system-ui,sans-serif");
  box.append(p, copy);
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      box.textContent = "Copied. In AcadKit: Settings → Paste a portal page, then paste.";
      setTimeout(() => box.remove(), 6000);
    } catch {
      // No clipboard permission: leave the text selected to copy by hand.
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("style", "display:block;margin-top:8px;width:80vw;height:120px");
      box.append(area);
      area.select();
      p.textContent = "Copy this text, then paste it into AcadKit.";
    }
  };
  return text;
}

/** The bookmark's address. */
export const COPY_ALL_MARKS_URL = `javascript:${encodeURIComponent(`(${copyAllMarks.toString()})()`)}`;
