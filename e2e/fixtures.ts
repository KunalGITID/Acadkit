import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";

/** The mock backend (scripts/dev-mock/server.mjs) and the PIN it seeds. */
const MOCK_ORIGIN = "http://127.0.0.1:54321";
export const MOCK_API = `${MOCK_ORIGIN}/rest/v1`;

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
  query: Record<string, string> = {}
): Promise<T[]> {
  const params = new URLSearchParams(query);
  const res = await request.get(`${MOCK_API}/${table}?${params}`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

/** Sign in through the real form. The mock accepts any email and password. */
export async function signIn(page: Page) {
  await page.goto("/");
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
