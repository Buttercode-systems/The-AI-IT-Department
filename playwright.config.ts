import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

const phone = (width: number, height: number) => ({
  ...devices["Pixel 7"],
  viewport: { width, height },
  screen: { width, height },
  isMobile: true,
  hasTouch: true,
});

const tablet = (width: number, height: number) => ({
  ...devices["Desktop Chrome"],
  viewport: { width, height },
  screen: { width, height },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
});

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 7_500 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 3 : undefined,
  reporter: process.env.CI
    ? [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    reducedMotion: "reduce",
  },
  projects: [
    { name: "phone-320x568", use: phone(320, 568) },
    { name: "phone-360x640", use: phone(360, 640) },
    { name: "phone-375x667", use: phone(375, 667) },
    { name: "phone-390x844", use: phone(390, 844) },
    { name: "phone-430x932", use: phone(430, 932) },
    { name: "phone-landscape-844x390", use: phone(844, 390) },
    { name: "tablet-768x1024", use: tablet(768, 1024) },
    { name: "tablet-landscape-1024x768", use: tablet(1024, 768) },
    { name: "laptop-1280x720", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } } },
    { name: "desktop-1440x900", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "wide-desktop-1920x1080", use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev --workspace @ai-it/control-plane -- --hostname 127.0.0.1 --port 3100",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://amcjrmhmrentzgxyohlm.supabase.co",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_otK-GHV9du5xWWodgCAP9Q_xrgfU_vs",
        },
      },
});
