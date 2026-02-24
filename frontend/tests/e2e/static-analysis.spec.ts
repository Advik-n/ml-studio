/**
 * ML Studio – Static Analysis / Unit-style Tests
 * Tests run without a live server using TypeScript source analysis.
 * These verify: "use client" coverage, new toast system (@radix-ui/react-toast),
 * removal of old libraries (sonner, react-hot-toast), error handling (extractApiError)
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

// ─── Source file helpers ─────────────────────────────────────────────────────

const FRONTEND = path.resolve(__dirname, "../../");

function readFile(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), "utf-8");
}

function walkDir(dir: string, ext: string[]): string[] {
  const results: string[] = [];
  const IGNORE = ["node_modules", ".next", "tests", "playwright-report"];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(FRONTEND, full);
    if (entry.isDirectory()) {
      results.push(...walkDir(full, ext));
    } else if (ext.includes(path.extname(entry.name))) {
      results.push(rel);
    }
  }
  return results;
}

function allSourceFiles(): string[] {
  return walkDir(FRONTEND, [".tsx", ".ts"]);
}

function filesUsingHooks(): string[] {
  return allSourceFiles().filter((f) => {
    const content = readFile(f);
    return /\buseState\b|\buseEffect\b|\buseCallback\b|\buseRef\b|\buseRouter\b|\buseForm\b/.test(content);
  });
}

// ─── "use client" coverage ────────────────────────────────────────────────────

test.describe("Static: 'use client' directive coverage", () => {
  test("every component using React hooks has 'use client'", () => {
    const missing: string[] = [];
    for (const file of filesUsingHooks()) {
      const content = readFile(file);
      // Skip page/layout RSC wrappers (they import client components)
      if (file.endsWith("page.tsx") || file.endsWith("layout.tsx")) continue;
      if (!content.startsWith('"use client"') && !content.startsWith("'use client'")) {
        missing.push(file);
      }
    }
    expect(missing, `Missing 'use client': ${missing.join(", ")}`).toHaveLength(0);
  });
});

// ─── Old toast libraries eliminated ──────────────────────────────────────────

test.describe("Static: react-hot-toast and sonner fully removed", () => {
  test("no source files import from react-hot-toast", () => {
    const offenders: string[] = [];
    for (const file of allSourceFiles()) {
      const content = readFile(file);
      if (/from ['"]react-hot-toast['"]/.test(content)) {
        offenders.push(file);
      }
    }
    expect(offenders, `Still importing react-hot-toast: ${offenders.join(", ")}`).toHaveLength(0);
  });

  test("no source files import from sonner", () => {
    const offenders: string[] = [];
    for (const file of allSourceFiles()) {
      const content = readFile(file);
      if (/from ['"]sonner['"]/.test(content)) {
        offenders.push(file);
      }
    }
    expect(offenders, `Still importing sonner: ${offenders.join(", ")}`).toHaveLength(0);
  });
});

// ─── New toast system with @radix-ui/react-toast ──────────────────────────────

test.describe("Static: new toast system implementation", () => {
  test("lib/toast.ts exists with subscribeToast export", () => {
    const content = readFile("lib/toast.ts");
    expect(content).toContain("export function subscribeToast");
  });

  test("lib/api-errors.ts exists with extractApiError export", () => {
    const content = readFile("lib/api-errors.ts");
    expect(content).toContain("export function extractApiError");
  });

  test("toaster-provider.tsx uses @radix-ui/react-toast", () => {
    const content = readFile("components/providers/toaster-provider.tsx");
    expect(content).toContain("@radix-ui/react-toast");
    expect(content).not.toContain('from "sonner"');
  });

  test("register-form.tsx uses extractApiError from @/lib/api-errors", () => {
    const content = readFile("components/auth/register-form.tsx");
    expect(content).toContain("extractApiError");
    expect(content).toContain("@/lib/api-errors");
  });

  test("prediction-gui.tsx uses extractApiError from @/lib/api-errors", () => {
    const content = readFile("components/pipeline/prediction-gui.tsx");
    expect(content).toContain("extractApiError");
    expect(content).toContain("@/lib/api-errors");
  });

  test("layout.tsx uses ToasterProvider (not Toaster or old libraries)", () => {
    const content = readFile("app/layout.tsx");
    expect(content).toContain("ToasterProvider");
    expect(content).not.toContain('from "react-hot-toast"');
    expect(content).not.toContain('from "sonner"');
  });
});

// ─── Auth cookie sync ─────────────────────────────────────────────────────────

test.describe("Static: auth.ts cookie sync", () => {
  test("login() sets document.cookie after localStorage", () => {
    const content = readFile("lib/auth.ts");
    expect(content).toContain("document.cookie");
    expect(content).toContain("access_token=");
    expect(content).toContain("max-age=");
  });

  test("logout() expires the cookie", () => {
    const content = readFile("lib/auth.ts");
    expect(content).toContain("max-age=0");
  });
});

// ─── No bare browser globals in server files ──────────────────────────────────

test.describe("Static: no bare browser globals in server modules", () => {
  const SERVER_FILES = ["app/layout.tsx", "middleware.ts"];

  for (const file of SERVER_FILES) {
    test(`${file} does not use bare window/document/localStorage`, () => {
      const content = readFile(file);
      const hasBareWindow = /(?<!typeof )\bwindow\./.test(content);
      const hasBareDoc = /(?<!typeof )\bdocument\./.test(content);
      const hasBareLS = /(?<!typeof )\blocalStorage\./.test(content);
      expect(hasBareWindow, `${file} uses bare window`).toBe(false);
      expect(hasBareDoc, `${file} uses bare document`).toBe(false);
      expect(hasBareLS, `${file} uses bare localStorage`).toBe(false);
    });
  }
});
