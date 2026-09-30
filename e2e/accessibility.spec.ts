import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, openSignIn, signIn, test, waitForLaunch } from "./fixtures";

/**
 * axe on every main screen, in light and dark: WCAG 2.1 A and AA. A
 * serious or critical violation fails the run; minor ones are left to
 * judgement.
 */
const SCREENS = ["/", "/attendance", "/marks", "/timetable", "/calendar", "/settings", "/files"];

async function audit(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n    ")}`);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} mode`, () => {
    // Reduced motion: the app then skips its entrance animations (MotionConfig
    // reducedMotion="user"), so axe never reads a colour mid-fade. A fixed
    // wait wasn't enough - Marks' SGPA dial failed about one run in five.
    test.use({ colorScheme: scheme, reducedMotion: "reduce" });

    test("the landing page", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForTimeout(500);
      expect(await audit(page)).toEqual([]);
    });

    test("the sign-in screen", async ({ page }) => {
      await openSignIn(page);
      // It fades in: axe reads colours mid-fade as low contrast.
      await page.waitForTimeout(1200);
      expect(await audit(page)).toEqual([]);
    });

    test("onboarding", async ({ page }) => {
      await openSignIn(page);
      await page.getByLabel("Email").fill("new-student@acadkit.test");
      await page.getByLabel("Password").fill("e2e-password");
      await page.locator("form").getByRole("button").click();
      await expect(page.getByText("Step 1 of 2")).toBeVisible();
      await page.waitForTimeout(1200);
      expect(await audit(page)).toEqual([]);

      await page.getByRole("button", { name: "Next" }).click();
      await page.getByRole("radio", { name: /CSE \(Data Science\)/ }).click();
      await page.waitForTimeout(1200);
      expect(await audit(page)).toEqual([]);
    });

    for (const path of SCREENS) {
      test(`${path}`, async ({ page }) => {
        await signIn(page);
        if (path !== "/") await page.goto(path);
        await waitForLaunch(page);
        // Let entrance animations finish: axe reads colours mid-fade as low contrast.
        await page.waitForTimeout(1200);
        expect(await audit(page)).toEqual([]);
      });
    }
  });
}
