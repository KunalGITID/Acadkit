import type { Page } from "@playwright/test";
import { expect, serverRows, test } from "./fixtures";

/** The Academia attendance page, as a copy of it arrives on the clipboard. */
const ATTENDANCE_PAGE = `<table><thead><tr>
  <th>Course Code</th><th>Course Title</th><th>Category</th><th>Faculty Name</th>
  <th>Hours Conducted</th><th>Hours Absent</th><th>Attn %</th>
</tr></thead><tbody>
  <tr><td>21CSC202J</td><td>Operating Systems</td><td>Theory</td><td>Dr. A (100001)</td><td>40</td><td>4</td><td>90.00</td></tr>
  <tr><td>21XYZ101T</td><td>Something New</td><td>Theory</td><td>Dr. B (100002)</td><td>30</td><td>6</td><td>80.00</td></tr>
</tbody></table>`;

const FINISH = /set up my semester|see the damage/i;

async function signInAsNewStudent(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill("new-student@acadkit.test");
  await page.getByLabel("Password").fill("e2e-password");
  await page.locator("form").getByRole("button").click();
  await expect(page.getByRole("heading", { name: "Welcome to AcadKit" })).toBeVisible();
}

async function aboutYou(page: Page, name: string) {
  await expect(page.getByText("Step 1 of 2")).toBeVisible();
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Semester").selectOption("3");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Step 2 of 2")).toBeVisible();
}

/** The new student's PIN, once onboarding has claimed one. */
async function newPin(request: Parameters<typeof serverRows>[0]) {
  const owned = await serverRows<{ device_id: string }>(request, "device_owners", {}, "new");
  expect(owned).toHaveLength(1);
  return owned[0].device_id;
}

test("a new student sets up from a pasted portal page", async ({ page, request }) => {
  await signInAsNewStudent(page);
  await aboutYou(page, "Asha");

  await page.getByRole("radio", { name: /Paste from the SRM portal/ }).click();
  await page.getByRole("textbox", { name: "Paste your attendance page here" }).evaluate((box, html) => {
    const data = new DataTransfer();
    data.setData("text/html", html);
    data.setData("text/plain", "copied");
    box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, ATTENDANCE_PAGE);

  // A course we know comes with its credits; a new one waits for them.
  await expect(page.getByLabel("Credits for Operating Systems")).toHaveValue("4");
  await expect(page.getByLabel("Credits for Something New")).toHaveValue("");
  await expect(page.getByText("Add the credits for Something New")).toBeVisible();
  await expect(page.getByRole("button", { name: FINISH })).toBeDisabled();

  await page.getByLabel("Credits for Something New").fill("3");
  await page.getByRole("button", { name: FINISH }).click();

  // Into the app, with what's still left to do.
  await expect(page.getByRole("heading", { name: "2 things left" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Add your timetable/ })).toBeVisible();

  const pin = await newPin(request);
  expect(pin).not.toBe("1234");
  const subjects = await serverRows<{ code: string; name: string; credits: number; faculty: string }>(
    request, "subjects", { device_id: `eq.${pin}` }
  );
  expect(subjects.map((s) => [s.code, s.name, s.credits, s.faculty]).sort()).toEqual([
    ["21CSC202J", "Operating Systems", 4, "Dr. A"],
    ["21XYZ101T", "Something New", 3, "Dr. B"],
  ]);
  const [settings] = await serverRows<{ name: string; semester: number }>(request, "settings", { device_id: `eq.${pin}` });
  expect(settings).toMatchObject({ name: "Asha", semester: 3 });
  // The attendance that was pasted to get the subjects is kept, too.
  expect(await serverRows(request, "portal_snapshots", { device_id: `eq.${pin}` })).toHaveLength(2);
});

test("a new student can start from the preset list", async ({ page, request }) => {
  await signInAsNewStudent(page);
  await aboutYou(page, "Ravi");

  await page.getByRole("radio", { name: /CSE \(Data Science\), Semester 3/ }).click();
  await expect(page.getByLabel("Credits for Operating Systems")).toHaveValue("4");
  await page.getByRole("button", { name: FINISH }).click();

  await expect(page.getByRole("heading", { name: "2 things left" })).toBeVisible();
  const pin = await newPin(request);
  expect(await serverRows(request, "subjects", { device_id: `eq.${pin}` })).toHaveLength(8);
});
