import { expect, serverRows, test, TODAY } from "./fixtures";

interface ActiveDay {
  device_id: string;
  day: string;
  installed: boolean;
}

test("opening the app counts the account as active today, once", async ({ signedIn: page, request }) => {
  const days = async () =>
    (await serverRows<ActiveDay>(request, "active_days")).map((r) => `${r.device_id} ${r.day} ${r.installed}`);

  await expect.poll(days).toEqual([`1234 ${TODAY} false`]);

  // Opening it again the same day adds nothing.
  await page.reload();
  await expect(page.getByRole("heading", { name: /Wednesday, 7 October/ })).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await days()).toEqual([`1234 ${TODAY} false`]);
});
