import { expect, serverRows, test } from "./fixtures";

interface MarkRow {
  label: string;
  marks_obtained: number;
  max_marks: number;
}

test("adding marks shows them on the subject and saves them", async ({ signedIn: page, request }) => {
  await page.goto("/marks");
  const card = page.locator("section").filter({ hasText: "Operating Systems" }).last();
  await card.getByRole("button", { name: "Add marks" }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Operating Systems")).toBeVisible();
  await sheet.getByLabel("Label").fill("E2E Test");
  await sheet.getByLabel("Obtained").fill("13");
  await sheet.getByLabel("Out of").fill("15");
  await sheet.getByRole("button", { name: "Add marks" }).click();

  await expect(sheet).toBeHidden();
  await expect(card.getByRole("button", { name: /E2E Test\s*13\/15/ })).toBeVisible();

  await expect
    .poll(async () =>
      (await serverRows<MarkRow>(request, "marks", { label: "eq.E2E Test" })).map(
        (m) => `${m.marks_obtained}/${m.max_marks}`
      )
    )
    .toEqual(["13/15"]);
});
