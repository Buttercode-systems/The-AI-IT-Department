import { expect, test } from "@playwright/test";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

test.describe("AID desktop command centre", () => {
  test.skip(({ isMobile }) => Boolean(isMobile), "Desktop interaction coverage");

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Your AI IT Department" })).toBeVisible();
  });

  test("home is clear, keyboard reachable and stable", async ({ page }, testInfo) => {
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message AID" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send message" })).toBeDisabled();

    await page.keyboard.press("Tab");
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedTag).toMatch(/BUTTON|TEXTAREA|A/);

    await expectNoHorizontalOverflow(page);
    await testInfo.attach("desktop-home", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });

  test("authentication dialog opens, exposes named controls and closes safely", async ({ page }) => {
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.getByPlaceholder("Email address")).toHaveAttribute("autocomplete", "email");
    await expect(page.getByPlaceholder("Password")).toHaveAttribute("autocomplete", "current-password");
    await expect(page.getByRole("button", { name: "Close" })).toBeVisible();

    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeHidden();
  });

  test("starter delegation preserves the request before authentication", async ({ page }) => {
    const starter = page.getByRole("button", { name: /Find customer emails I have not replied to/ });
    await starter.click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message AID" })).toHaveValue("Find customer emails I have not replied to");
  });
});

test.describe("AID mobile command centre", () => {
  test.skip(({ isMobile }) => !isMobile, "Mobile interaction coverage");

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Your AI IT Department" })).toBeVisible();
  });

  test("conversation sheet provides a complete escape and navigation path", async ({ page }, testInfo) => {
    const history = page.getByRole("button", { name: "Open conversations" });
    await expect(history).toBeVisible();
    await expect(history).toHaveAttribute("aria-expanded", "false");
    await history.click();

    const sheet = page.getByRole("dialog", { name: "Conversations" });
    await expect(sheet).toBeVisible();
    await expect(page.getByRole("button", { name: "New conversation Start with a clean context" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await testInfo.attach("mobile-conversation-sheet", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    await page.getByRole("button", { name: "Close conversations" }).click();
    await expect(sheet).toBeHidden();
  });

  test("authentication remains reachable through the mobile navigation model", async ({ page }) => {
    await page.getByRole("button", { name: "Open conversations" }).click();
    const sheet = page.getByRole("dialog", { name: "Conversations" });
    await sheet.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("primary controls meet the 44-point release touch-target minimum", async ({ page }) => {
    const controls = [
      page.getByRole("button", { name: "Open conversations" }),
      page.getByRole("button", { name: "Settings" }),
      page.getByRole("button", { name: "Send message" }),
    ];

    for (const control of controls) {
      const box = await control.boundingBox();
      expect(box, "control should be rendered").not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    await expectNoHorizontalOverflow(page);
  });
});
