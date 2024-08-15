import { defineConfig, devices } from "@playwright/test";

/**
 * Journeys run against an already-running local stack (`pnpm dev` + Supabase), because
 * they share the real database. One worker keeps the daily and admin journeys from
 * colliding.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
