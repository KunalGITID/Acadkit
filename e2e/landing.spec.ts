import { expect, test } from "./fixtures";

test("a visitor sees what AcadKit is, and can get started", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("attendance, marks and Day Order");
  await expect(page.getByRole("img", { name: /AcadKit on a phone/ })).toBeVisible();
  await expect(page.getByText(/not affiliated with or endorsed by SRM/)).toBeVisible();

  // Get started opens the form ready to create an account...
  await page.getByRole("button", { name: /Get started/ }).first().click();
  await expect(page.getByLabel("Password")).toHaveAttribute("autocomplete", "new-password");

  // ...and there's a way back.
  await page.getByRole("button", { name: "What is AcadKit?" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
