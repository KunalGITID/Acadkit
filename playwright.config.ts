import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;

/**
 * End-to-end tests against `npm run dev:mock`: the real app in a real
 * browser, talking to the in-memory mock backend (scripts/dev-mock).
 * Nothing here touches a real Supabase project.
 */
export default defineConfig({
  testDir: "e2e",
  // One worker: the mock keeps its data in memory for the whole run,
  // so parallel specs would be writing into each other's semester.
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:5173",
    ...devices["Pixel 7"],
    // Day orders and "today" are worked out in the phone's local time.
    timezoneId: "Asia/Kolkata",
    locale: "en-IN",
    // The dev server has no service worker, and a stale one from a
    // preview build must not answer instead of Vite.
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev:mock",
    url: "http://localhost:5173",
    // Always our own mock, never a `dev:mock` you left running: that one
    // serves your real study folder, and the specs reset its data.
    reuseExistingServer: false,
    timeout: 60_000,
    // The mock serves the study folder on the Files page. Point it at a
    // tiny committed one (a PDF and a zip), so a run on the Mac sees what CI
    // sees and the viewer's Download can be tested on real bytes.
    env: { STUDY_DIR: "e2e/study-fixture" },
  },
});
