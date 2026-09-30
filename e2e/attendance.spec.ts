import type { Page } from "@playwright/test";
import { expect, serverRows, test, TODAY } from "./fixtures";

interface AttendanceRow {
  subject_id: string;
  date: string;
  start_time: string;
  status: string;
}

/** Calendar → today → "Mark attendance for this day". */
async function openTodaysSheet(page: Page) {
  await page.goto("/calendar");
  await page.getByRole("button", { name: /^7\s*D\d$/ }).click();
  await page.getByRole("button", { name: "Mark attendance for this day" }).click();
  await expect(page.getByText(/Day Order \d - tap to mark/)).toBeVisible();
}

test("signing in lands on today's dashboard", async ({ signedIn: page }) => {
  // Day Order 3's first class in the mock timetable, flagged as next up.
  const firstClass = page.getByText("8:00 AM – 8:50 AM · TP300").last();
  await expect(firstClass).toBeVisible();
  await expect(page.getByRole("link", { name: "Attendance" }).last()).toBeVisible();
});

test("marking a class saves it to the server", async ({ signedIn: page, request }) => {
  await openTodaysSheet(page);

  const present = page.getByRole("button", { name: "Present - Operating Systems" });
  await present.click();
  await expect(present).toHaveAttribute("aria-pressed", "true");

  await expect
    .poll(async () =>
      (await serverRows<AttendanceRow>(request, "attendance", { date: `eq.${TODAY}` })).map(
        (r) => r.status
      )
    )
    .toEqual(["present"]);
});

test("a class marked offline is replayed when the connection returns", async ({
  signedIn: page,
  context,
  request,
}) => {
  await openTodaysSheet(page);
  const absent = page.getByRole("button", { name: "Absent - Data Structures & Algorithms" });
  const saved = async () =>
    (await serverRows<AttendanceRow>(request, "attendance", { date: `eq.${TODAY}`, status: "eq.absent" }))
      .length;

  await context.setOffline(true);
  await expect(page.getByText(/^Offline - your changes are saved/)).toBeVisible();

  await absent.click();
  // The screen updates straight away; the write waits for the network.
  await expect(absent).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(1_000);
  expect(await saved()).toBe(0);

  await context.setOffline(false);
  await expect(page.getByText(/^Offline - your changes are saved/)).toBeHidden();
  await expect.poll(saved).toBe(1);
});
