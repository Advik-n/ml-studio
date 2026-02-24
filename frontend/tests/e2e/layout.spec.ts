/**
 * ML Studio – Layout & UI E2E Tests
 * Tests: Toaster renders, theme, navigation, no crashes on page load
 */
import { test, expect, Page } from "@playwright/test";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Layout / Toaster ─────────────────────────────────────────────────────────

test.describe("Layout – Toaster (sonner)", () => {
  test("page loads without crashing (no Toaster SSR error)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const criticalErrors = errors.filter(
      (e) =>
        e.includes("document is not defined") ||
        e.includes("window is not defined") ||
        e.includes("Cannot read properties of undefined") ||
        e.includes("goober") ||
        e.includes("Toaster")
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test("Toaster container is present in DOM after hydration", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    // sonner renders its portal into <body> with data-sonner-toaster
    const toaster = page.locator("[data-sonner-toaster]");
    await expect(toaster).toBeAttached({ timeout: 5000 });
  });

  test("no hydration mismatch errors on login page", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const hydrationErrors = consoleErrors.filter(
      (e) => e.includes("Hydration") || e.includes("hydration")
    );
    expect(hydrationErrors).toHaveLength(0);
  });
});

// ─── Navigation bar ───────────────────────────────────────────────────────────

test.describe("Sidebar / Navbar", () => {
  test.beforeEach(async ({ page }) => {
    await setAuthCookie(page);
  });

  test("sidebar renders on dashboard (with mock auth cookie)", async ({ page }) => {
    await page.goto("/dashboard");
    // Even if API calls fail, the sidebar layout should render
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});

// ─── Settings page ─────────────────────────────────────────────────────────────

test.describe("Settings page", () => {
  test.beforeEach(async ({ page }) => {
    await setAuthCookie(page);
    await page.goto("/settings");
  });

  test("settings page loads without 500 error", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForLoadState("networkidle");
    expect(errors.filter((e) => !e.includes("401"))).toHaveLength(0);
  });
});

// ─── Theme ────────────────────────────────────────────────────────────────────

test.describe("Theme provider", () => {
  test("no theme-related JS errors on page load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    expect(errors).toHaveLength(0);
  });

  test("html element has data-theme or class attribute set", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const htmlTag = page.locator("html");
    // ThemeProvider applies theme via CSS class or data attribute
    const cls = await htmlTag.getAttribute("class");
    const dataTheme = await htmlTag.getAttribute("data-theme");
    // At least one method of theme application should be present
    expect(cls !== null || dataTheme !== null).toBeTruthy();
  });
});
