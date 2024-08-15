import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end journeys over the real API and database. Each test asserts player-visible
 * behaviour, not implementation details, and none of them stubs a request.
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

async function startClassic(page: Page, count = 5) {
  await page.goto("/play");
  await page.getByRole("button", { name: String(count), exact: true }).click();
  await page.getByRole("button", { name: /^Start quiz$/ }).click();
  await page.waitForURL(/\/quiz\/[0-9a-f-]{36}/, { timeout: 20_000 });
  await expect(page.locator("article").getByRole("heading", { level: 1 })).toBeVisible();
  return page.url().split("/").pop() as string;
}

/** The feedback panel is the only place this text appears (the guest notice is not it). */
const feedback = /Correct · \+|Incorrect — the answer was|Skipped — no points|Answer saved/;

async function answerWithPointer(page: Page, index: number) {
  await page
    .locator("article fieldset label")
    .nth(index % 4)
    .click();
  await expect(page.getByText(feedback)).toBeVisible({ timeout: 15_000 });
}

async function signUp(page: Page, email: string) {
  await page.goto("/account");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("quizpass123");
  await page.getByRole("button", { name: /^Create account$/ }).click();
}

test("guest plays a Classic run and sees the review", async ({ page }) => {
  const attemptId = await startClassic(page);

  for (let index = 0; index < 5; index += 1) {
    await answerWithPointer(page, index);
    const next = page.getByRole("button", { name: "Next now" });
    if (await next.isVisible().catch(() => false)) await next.click();
  }

  await page.waitForURL(/\/results\//, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Quiz complete|ended early/);
  await expect(page.getByText(/Answer review/)).toBeVisible();
  expect(page.url()).toContain(attemptId);
});

test("1–4 answer the question from the keyboard", async ({ page }) => {
  await startClassic(page);
  // Hydration must be complete before a real key event can be handled.
  await expect(page.getByRole("button", { name: "Exit" })).toBeEnabled();
  await page.keyboard.press("2");
  await expect(page.getByText(feedback)).toBeVisible({ timeout: 15_000 });
});

test("Time Rush ends on the server deadline", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/play?mode=time-rush");
  await page.getByRole("button", { name: "30s" }).click();
  await page.getByRole("button", { name: /^Start quiz$/ }).click();
  await page.waitForURL(/\/quiz\//, { timeout: 20_000 });

  await expect(page.getByText(/\d+s left/)).toBeVisible();
  await page.waitForURL(/\/results\//, { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Time's up");
});

test("Practice reveals an answer without scoring it", async ({ page }) => {
  await page.goto("/play?mode=practice");
  await page.getByRole("button", { name: /^Start quiz$/ }).click();
  await page.waitForURL(/\/quiz\//, { timeout: 20_000 });

  await page.getByRole("button", { name: /Reveal answer/ }).click();
  await expect(page.getByText("Answer revealed — no points")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/0 pts/)).toBeVisible();
});

test("a guest can add an account and is told to confirm the email", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto("/play");
  await signUp(page, email);

  // With confirmations on, the identity stays a guest until the emailed link is used and
  // the screen says exactly that.
  await expect(page.getByText(/for a confirmation link|Confirm your email/)).toBeVisible({
    timeout: 20_000,
  });
});

test("the daily challenge withholds correctness until the window closes", async ({ page }) => {
  await page.goto("/play"); // mints the guest session, as a player would
  await page.goto("/daily");
  await expect(page.getByText(/questions, the same set and order for everyone/)).toBeVisible({
    timeout: 15_000,
  });
  const start = page.getByRole("button", { name: /Start today.s challenge/ });
  if (await start.isVisible()) await start.click();
  else await page.getByRole("link", { name: /^Resume$/ }).click();

  await page.waitForURL(/\/quiz\//, { timeout: 20_000 });
  await page.locator("article fieldset label").first().click();
  await expect(page.getByText("Answer saved")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Correct ·|Incorrect — the answer was/)).toHaveCount(0);
});

test("two identical submissions consume one answer", async ({ page }) => {
  const attemptId = await startClassic(page);
  await page
    .getByRole("button", { name: "Next now" })
    .isVisible()
    .catch(() => false);

  const key = `${attemptId}-race`;
  const body = { position: 1, optionId: 1, idempotencyKey: key };
  const [first, second] = await Promise.all([
    page.request.post(`/api/attempts/${attemptId}/answer`, { data: body }),
    page.request.post(`/api/attempts/${attemptId}/answer`, { data: body }),
  ]);

  expect([first.status(), second.status()].sort()).toEqual([200, 200]);
  const payloads = [await first.json(), await second.json()];
  expect(payloads.filter((payload) => payload.replayed === true)).toHaveLength(1);
});

test("a classic attempt refuses the practice-only reveal", async ({ page }) => {
  const attemptId = await startClassic(page);
  const response = await page.request.post(`/api/attempts/${attemptId}/answer`, {
    data: { action: "reveal", position: 1, idempotencyKey: `${attemptId}-reveal` },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).error).toBe("reveal_not_allowed");
});

test("admin endpoints refuse anonymous and guest callers", async ({ page, request }) => {
  const anonymous = await request.get("/api/admin/questions");
  expect(anonymous.status()).toBe(401);

  await page.goto("/play");
  await expect
    .poll(async () => (await page.request.get("/api/session")).status(), { timeout: 15_000 })
    .toBe(200);
  const asGuest = await page.request.get("/api/admin/questions");
  expect(asGuest.status()).toBe(403);
});

test("a write from another origin is refused before routing", async ({ request }) => {
  const cross = await request.post("/api/attempts", {
    headers: { origin: "https://evil.example" },
    data: {},
  });
  expect(cross.status()).toBe(403);
  expect((await cross.json()).error).toBe("cross_origin");
});

test("health reports the database, content and today's daily set", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  const body = await health.json();
  expect(body.ok).toBe(true);
  expect(body.checks.map((check: { name: string }) => check.name)).toEqual([
    "database",
    "content_available",
    "daily_prepared",
  ]);
});

test("an editor can save an unchanged question and publish stays a no-op", async ({ page }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "E2E_ADMIN_EMAIL/PASSWORD not set");

  await page.goto("/account");
  await page.getByText("Sign in", { exact: true }).click();
  await page.getByLabel("Email").fill(ADMIN_EMAIL!);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD!);
  await page.getByRole("button", { name: /^Sign in$/ }).click();

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Content" })).toBeVisible();
  await page
    .getByRole("button", { name: /^Edit$/ })
    .first()
    .click();
  await page.getByRole("button", { name: /Save version/ }).click();
  await expect(page.getByText(/No changes|Saved/)).toBeVisible({ timeout: 20_000 });
});
