import { readFileSync } from "node:fs";
import { devices, type Page } from "@playwright/test";
import { expect, signIn, test } from "./fixtures";

// e2e/study-fixture is the mock's study folder (playwright.config.ts).
const PDF = "Operating_Systems/Unit 2 scheduling notes.pdf";
const ZIP = "Operating_Systems/Lab 4 files.zip";
const bytes = (p: string) => readFileSync(`e2e/study-fixture/${p}`);

async function open(page: Page, path: string) {
  await signIn(page);
  await page.goto(`/view?path=${encodeURIComponent(path)}`);
}

test("Download saves the file itself, under its real name", async ({ signedIn: page }) => {
  await page.goto(`/view?path=${encodeURIComponent(PDF)}`);
  const button = page.getByRole("link", { name: "Download" });
  await expect(button).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  expect(download.suggestedFilename()).toBe("Unit 2 scheduling notes.pdf");
  expect(readFileSync(await download.path())).toEqual(bytes(PDF));
  // The bytes came from the app, not a link to storage: the page never left.
  expect(page.url()).toContain("/view?path=");
});

test("a file the viewer can't show still downloads, from its card", async ({ signedIn: page }) => {
  await page.goto(`/view?path=${encodeURIComponent(ZIP)}`);
  const button = page.getByRole("link", { name: "Download Lab 4 files.zip" });
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  expect(download.suggestedFilename()).toBe("Lab 4 files.zip");
  expect(readFileSync(await download.path())).toEqual(bytes(ZIP));
});

test.describe("on an iPhone", () => {
  test.use({ userAgent: devices["iPhone 15"].userAgent, hasTouch: true });

  test("Download opens the share sheet with the file, instead of following a link", async ({ page }) => {
    // Record what reaches the share sheet; Chromium's own share() isn't the point here.
    await page.addInitScript(() => {
      const shared: Array<{ name: string; type: string; size: number }> = [];
      (window as unknown as { __shared: typeof shared }).__shared = shared;
      Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: (d: { files: File[] }) => {
          shared.push(...d.files.map((f) => ({ name: f.name, type: f.type, size: f.size })));
          return Promise.resolve();
        },
      });
    });
    await open(page, PDF);
    let downloads = 0;
    page.on("download", () => downloads++);
    await page.getByRole("link", { name: "Download" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared)).toEqual([
      { name: "Unit 2 scheduling notes.pdf", type: "application/pdf", size: bytes(PDF).length },
    ]);
    expect(downloads).toBe(0);
    expect(page.url()).toContain("/view?path=");
  });
});
