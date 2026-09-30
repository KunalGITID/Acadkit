import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";

/** The mock backend (scripts/dev-mock/server.mjs) and the PIN it seeds. */
const MOCK_ORIGIN = "http://127.0.0.1:54321";
export const MOCK_API = `${MOCK_ORIGIN}/rest/v1`;
/** The account an email starting with "new" signs in to: no PIN yet, so it gets onboarding. */
export const NEW_USER = "11111111-1111-4111-8111-111111111111";

/**
 * Every spec runs on Wednesday 7 Oct 2026 at 07:30 IST: a working day
 * (Day Order 3) inside the mock's semester, before any class has
 * started. Pinning it keeps the calendar the same whatever day CI runs.
 */
export const TODAY = "2026-10-07";
const NOW = new Date(`${TODAY}T07:30:00+05:30`);

/** Rows the mock backend holds right now - what actually got saved. */
export async function serverRows<T = Record<string, unknown>>(
  request: APIRequestContext,
  table: string,
  query: Record<string, string> = {},
  /** Whose rows: the mock filters PIN claims by account, the way RLS does. */
  as: "seeded" | "new" = "seeded"
): Promise<T[]> {
  const params = new URLSearchParams(query);
  const headers = as === "new" ? { authorization: `Bearer mock-access-token.${NEW_USER}` } : undefined;
  const res = await request.get(`${MOCK_API}/${table}?${params}`, { headers });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

/**
 * Wait out the launch screen. The first app launch of a day plays the full
 * sequence (~1.9 s), and anything read before it lifts - a screenshot, an
 * axe contrast check - reads the splash instead of the page.
 */
export async function waitForLaunch(page: Page) {
  // Not just "the splash is gone": the app mounts after the page loads
  // (src/main.tsx imports it lazily), so right after a navigation the splash
  // may not have appeared yet. Wait for the app's content with no splash over it.
  await page.waitForFunction(
    () => document.querySelector("main") && !document.querySelector("[data-launch-screen]"),
    undefined,
    { timeout: 10_000 }
  );
}

/** From the landing page to the sign-in form. */
export async function openSignIn(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await expect(page.getByLabel("Email")).toBeVisible();
}

/** Sign in through the real form. The mock accepts any email and password. */
export async function signIn(page: Page) {
  await openSignIn(page);
  await page.getByLabel("Email").fill("e2e@acadkit.test");
  await page.getByLabel("Password").fill("e2e-password");
  await page.locator("form").getByRole("button").click();
  await expect(page.getByRole("heading", { name: /Wednesday, 7 October/ })).toBeVisible();
}

export const test = base.extend<{ signedIn: Page }>({
  page: async ({ page, request }, provide) => {
    // Back to the seeded semester, so no spec sees another's writes.
    expect((await request.post(`${MOCK_ORIGIN}/__reset`)).ok()).toBeTruthy();
    await page.clock.setFixedTime(NOW);
    await provide(page);
  },
  signedIn: async ({ page }, provide) => {
    await signIn(page);
    await provide(page);
  },
});

export { expect };
