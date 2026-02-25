/**
 * ML Studio – Authentication E2E Tests
 * Tests: login, register, logout, redirect guards, form validation
 */
import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:3000";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function login(page: Page, username = "testuser", password = "testpass") {
  await page.goto("/login");
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}

// ─── Middleware / redirect guards ─────────────────────────────────────────────

test.describe("Middleware – redirect guards", () => {
  test("unauthenticated user is redirected to /login from /dashboard", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated user is redirected to /login from /projects", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated user is redirected to /login from /settings", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirect preserves destination path in query string", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/redirect=%2Fdashboard/);
  });
});

// ─── Login page ───────────────────────────────────────────────────────────────

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/login");
  });

  test("renders login form with all required fields", async ({ page }) => {
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("shows validation errors on empty submit", async ({ page }) => {
    await page.click('button[type="submit"]');
    await expect(page.locator("text=Username is required")).toBeVisible();
    await expect(page.locator("text=Password is required")).toBeVisible();
  });

  test("password toggle shows/hides password", async ({ page }) => {
    await page.fill('input[name="password"]', "secret");
    const passwordInput = page.locator('input[name="password"]');
    await expect(passwordInput).toHaveAttribute("type", "password");
    // Click the eye icon toggle
    await page.locator('button[type="button"]').first().click();
    await expect(passwordInput).toHaveAttribute("type", "text");
  });

  test("shows error toast on invalid credentials", async ({ page }) => {
    await page.fill('input[name="username"]', "wrong_user");
    await page.fill('input[name="password"]', "wrong_pass");
    await page.click('button[type="submit"]');
    // Toast should appear (sonner renders as [data-sonner-toast] or with role="status")
    await expect(page.locator("[data-sonner-toaster]")).toBeVisible({ timeout: 5000 });
  });

  test("link to register page works", async ({ page }) => {
    await page.click("text=Create one");
    await expect(page).toHaveURL(/\/register/);
  });
});

// ─── Register page ────────────────────────────────────────────────────────────

test.describe("Register page", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/register");
  });

  test("renders first step fields", async ({ page }) => {
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toHaveText(/Continue/i);
  });

  test("shows validation errors for empty submission", async ({ page }) => {
    await page.click('button[type="submit"]');
    await expect(page.locator("text=Full name must be at least 2 characters")).toBeVisible();
    await expect(page.locator("text=Username must be at least 3 characters")).toBeVisible();
    await expect(page.locator("text=Invalid email address")).toBeVisible();
  });

  test("shows error for invalid email format", async ({ page }) => {
    await page.fill('input[name="name"]', "Test User");
    await page.fill('input[name="username"]', "user123");
    await page.fill('input[name="email"]', "not-an-email");
    await page.click('button[type="submit"]');
    await expect(page.locator("text=Invalid email address").first()).toBeVisible();
  });

  test("link back to login page works", async ({ page }) => {
    await page.click("text=Sign in");
    await expect(page).toHaveURL(/\/login/);
  });
});

// ─── Root page ────────────────────────────────────────────────────────────────

test.describe("Root page (/)", () => {
  test("root redirects or renders without crashing", async ({ page }) => {
    await page.context().clearCookies();
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(500);
  });
});
