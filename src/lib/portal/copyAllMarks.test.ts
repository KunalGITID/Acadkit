/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { COPY_ALL_MARKS_URL, copyAllMarks } from "@/lib/portal/copyAllMarks";
import { COPY_HEADER } from "@/lib/portal/marksPaste";
import { parsePastedText } from "@/lib/portal/paste";

// A stand-in for the portal's Internal Mark Details page: a summary table
// with View Details buttons, and one shared Bootstrap popup they fill in.
const SUBJECTS: Record<string, Array<[string, string, string]>> = {
  "21CSS202T": [["31/Aug/2026", "FT-I", "2.00 / 5.00"], ["30/Sep/2026", "FT-II", "7.60 / 15.00"]],
  "21CSC201J": [["30/Sep/2026", "FJ-I", "4.10 / 15.00"]],
  "21MAB201T": [["29/Aug/2026", "FT-I", "5.00 / 5.00"], ["29/Sep/2026", "FT-II", "Abs / 15.00"]],
};

function portalPage() {
  document.body.innerHTML = `
    <table><thead><tr><th>Code</th><th>Description</th><th>Mark / Max. Mark</th><th></th></tr></thead><tbody>
    ${Object.keys(SUBJECTS).map((code) => `<tr><td>${code}</td><td>X</td><td>0 / 0</td>
      <td><button onclick="funViewComponentWiseMarks('1', '${code}', 'X', 2)">View Details</button></td></tr>`).join("")}
    </tbody></table>
    <div class="modal fade" id="confirmModal"><div class="modal-header"><h5 class="modal-title"></h5></div>
      <div class="modal-body"><table><thead><tr><th>Entered on</th><th>Component</th><th>Mark / Max. Mark</th></tr></thead><tbody></tbody></table></div>
      <button data-dismiss="modal">Close</button></div>`;
  const modal = document.getElementById("confirmModal")!;
  const open = (code: string) => {
    // The portal fills the popup a moment after the click.
    setTimeout(() => {
      modal.querySelector(".modal-title")!.textContent = `${code} - SUBJECT`;
      modal.querySelector("tbody")!.innerHTML = SUBJECTS[code]
        .map(([d, c, m]) => `<tr><td>${d}</td><td>${c}</td><td>${m}</td></tr>`).join("");
      modal.className = "modal fade show";
    }, 50);
  };
  // The page runs onclick="funViewComponentWiseMarks(...)"; happy-dom doesn't run inline handlers.
  for (const btn of document.querySelectorAll("button[onclick]")) {
    const code = /'(\w+)',\s*'X'/.exec(btn.getAttribute("onclick")!)![1];
    btn.addEventListener("click", () => open(code));
  }
  modal.querySelector("[data-dismiss]")!.addEventListener("click", () => {
    modal.className = "modal fade";
  });
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("Copy all marks", () => {
  it("opens every popup and copies what AcadKit's paste reads back, subject by subject", async () => {
    portalPage();
    const text = await copyAllMarks();
    expect(text?.split("\n")[0]).toBe(COPY_HEADER);
    const marks = parsePastedText(text!).marks.map((m) => `${m.subject_code} ${m.label} ${m.marks_obtained}/${m.max_marks}`);
    expect(marks).toEqual([
      "21CSS202T FT-I 2/5",
      "21CSS202T FT-II 7.6/15",
      "21CSC201J FJ-I 4.1/15",
      "21MAB201T FT-I 5/5",
      "21MAB201T FT-II 0/15",
    ]);
    // A button to copy, because the clicks used up the original tap.
    expect(document.body.textContent).toContain("Copy for AcadKit");
  }, 20_000);

  it("says where to go when it isn't on the marks page", async () => {
    document.body.innerHTML = "<p>Dashboard</p>";
    expect(await copyAllMarks()).toBeNull();
    expect(document.body.textContent).toContain("Internal Mark Details");
  });

  it("is a self-contained javascript: bookmark", () => {
    expect(COPY_ALL_MARKS_URL.startsWith("javascript:")).toBe(true);
    const source = decodeURIComponent(COPY_ALL_MARKS_URL.slice("javascript:".length));
    expect(source).toContain(COPY_HEADER);
    expect(() => new Function(source)).not.toThrow(); // it parses on its own
  });
});
