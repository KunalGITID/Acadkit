import type { Page } from "@playwright/test";
import { expect, serverRows, test } from "./fixtures";

interface MarkRow { label: string; marks_obtained: number; max_marks: number; source: string; subject_id: string }

async function paste(page: Page, text: string) {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Paste a portal page" }).click();
  const box = page.getByRole("textbox", { name: "Paste the portal page here" });
  await box.focus();
  // A plain-text clipboard: what an iPhone gives and what Copy all marks writes.
  await box.evaluate((el, t) => {
    const data = new DataTransfer();
    data.setData("text/plain", t);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

test("one paste of Copy all marks fills every subject, replacing a test typed by hand", async ({ signedIn: page, request }) => {
  const [mab] = await serverRows<{ id: string }>(request, "subjects", { code: "eq.21MAB201T" });
  const before = await serverRows<MarkRow>(request, "marks", { subject_id: `eq.${mab.id}` });
  expect(before.map((m) => `${m.label} ${m.source}`)).toContain("CT1 manual");
  const untouched = before.filter((m) => m.label !== "CT1").map((m) => `${m.label} ${m.marks_obtained}/${m.max_marks} ${m.source}`);

  await paste(page, ["AcadKit marks v1", "21MAB201T\tFT-I\t5.00\t5.00", "21MAB201T\tFT-II\t3.00\t15.00", "21CSS202T\tFT-I\t2.00\t5.00"].join("\n"));
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("3 marks across 2 subjects")).toBeVisible();
  await expect(sheet.getByText("FT-I 5/5 · FT-II 3/15")).toBeVisible();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();

  // FT-I is CT1 by another name: the typed CT1 became the portal's FT-I, not a second test.
  await expect
    .poll(async () => (await serverRows<MarkRow>(request, "marks", { subject_id: `eq.${mab.id}` }))
      .map((m) => `${m.label} ${m.marks_obtained}/${m.max_marks} ${m.source}`).sort())
    .toEqual([...untouched, "FT-I 5/5 portal", "FT-II 3/15 portal"].sort());
});

test("pasting the marks summary checks totals instead of failing", async ({ signedIn: page }) => {
  await paste(page, "Internal Mark Details\nCode\tDescription\tMark / Max. Mark\n21CSS202T\tFUNDAMENTALS OF DATA SCIENCE\t9.60 / 20.00\tView Details");
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("1 subject differs from the portal")).toBeVisible();
  await expect(sheet.getByText(/portal 9\.6\/20 · AcadKit/)).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Save" })).toBeDisabled(); // totals are checked, not saved
});

test("a popup copied without its title asks which subject", async ({ signedIn: page, request }) => {
  await paste(page, "Entered on\tComponent\tMark / Max. Mark\n30/Sep/2026\tFT-II\t7.60 / 15.00");
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("button", { name: "Save" })).toBeDisabled();
  await sheet.getByLabel("which subject is this?").selectOption({ label: "Fundamentals of Data Science (21CSS202T)" });
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
  const [fds] = await serverRows<{ id: string }>(request, "subjects", { code: "eq.21CSS202T" });
  await expect
    .poll(async () => (await serverRows<MarkRow>(request, "marks", { subject_id: `eq.${fds.id}`, label: "eq.FT-II" })).map((m) => m.marks_obtained))
    .toEqual([7.6]);
});
