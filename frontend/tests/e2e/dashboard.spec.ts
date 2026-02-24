/**
 * ML Studio – Dashboard & Projects E2E Tests
 * Tests: dashboard page, project list, new project modal, project routes
 */
import { test, expect, Page } from "@playwright/test";

async function setAuthCookie(page: Page) {
  await page.context().addCookies([
    {
      name: "access_token",
      value: "fake-token-for-ui-testing",
      domain: "localhost",
      path: "/",
    },
  ]);
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

test.describe("Dashboard page", () => {
  test.beforeEach(async ({ page }) => {
    await setAuthCookie(page);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
  });

  test("dashboard page renders without JS crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(errors.filter((e) => !e.includes("401") && !e.includes("403"))).toHaveLength(0);
  });

  test("no SSR window/document errors in console", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
    const ssrErrors = consoleErrors.filter(
      (e) =>
        e.includes("window is not defined") ||
        e.includes("document is not defined") ||
        e.includes("localStorage is not defined")
    );
    expect(ssrErrors).toHaveLength(0);
  });
});

// ─── Projects list ────────────────────────────────────────────────────────────

test.describe("Projects page", () => {
  test.beforeEach(async ({ page }) => {
    await setAuthCookie(page);
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
  });

  test("projects page renders without crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(errors.filter((e) => !e.includes("401"))).toHaveLength(0);
  });
});

// ─── Dynamic project routes ───────────────────────────────────────────────────

test.describe("Project detail routes", () => {
  test.beforeEach(async ({ page }) => {
    await setAuthCookie(page);
  });

  test("/projects/[id] page doesn't crash with fake id", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/projects/00000000-0000-0000-0000-000000000001");
    await page.waitForLoadState("networkidle");
    expect(errors.filter((e) => !e.includes("401") && !e.includes("404"))).toHaveLength(0);
  });

  test("/projects/[id]/eda page doesn't crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/projects/00000000-0000-0000-0000-000000000001/eda");
    await page.waitForLoadState("networkidle");
    expect(errors.filter((e) => !e.includes("401") && !e.includes("404"))).toHaveLength(0);
  });

  test("/projects/[id]/pipeline page doesn't crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/projects/00000000-0000-0000-0000-000000000001/pipeline");
    await page.waitForLoadState("networkidle");
    expect(errors.filter((e) => !e.includes("401") && !e.includes("404"))).toHaveLength(0);
  });
});
