import { expect, test } from "@playwright/test";

async function expectInsideViewport(page: import("@playwright/test").Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  expect(box, `${selector} should render`).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(box!.x, `${selector} should not escape left`).toBeGreaterThanOrEqual(-1);
  expect(box!.y, `${selector} should not escape top`).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width, `${selector} should not escape right`).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height, `${selector} should not escape bottom`).toBeLessThanOrEqual(viewport!.height + 1);
}

async function expectNoPageOverflow(page: import("@playwright/test").Page) {
  const result = await page.evaluate(() => ({
    rootWidth: document.documentElement.scrollWidth,
    rootClientWidth: document.documentElement.clientWidth,
    bodyWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    rootHeight: document.documentElement.scrollHeight,
    rootClientHeight: document.documentElement.clientHeight,
  }));

  expect(result.rootWidth).toBeLessThanOrEqual(result.rootClientWidth + 1);
  expect(result.bodyWidth).toBeLessThanOrEqual(result.bodyClientWidth + 1);
  expect(result.rootHeight).toBeLessThanOrEqual(result.rootClientHeight + 2);
}

async function expectMinimumTouchTarget(locator: import("@playwright/test").Locator, minimum = 40) {
  const box = await locator.boundingBox();
  expect(box, "control should render").not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(minimum);
  expect(box!.height).toBeGreaterThanOrEqual(minimum);
}

test.describe("responsive release matrix", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Your AI IT Department" })).toBeVisible();
  });

  test("public chat shell fits the viewport without clipping", async ({ page }, testInfo) => {
    await expectNoPageOverflow(page);
    await expectInsideViewport(page, ".chat-main");
    await expectInsideViewport(page, ".chat-header");
    await expectInsideViewport(page, ".composer-wrap");
    await expect(page.getByRole("textbox", { name: "Message AID" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();

    const starterCards = page.locator(".starter-grid button");
    await expect(starterCards).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      const card = starterCards.nth(index);
      const box = await card.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    }

    await testInfo.attach(`shell-${testInfo.project.name}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });

  test("composer remains usable at every supported size", async ({ page }) => {
    const textbox = page.getByRole("textbox", { name: "Message AID" });
    const send = page.getByRole("button", { name: "Send message" });

    await textbox.fill("Check this responsive layout");
    await expect(send).toBeEnabled();
    await expectMinimumTouchTarget(send, 40);
    await expectInsideViewport(page, ".composer");
    await expectNoPageOverflow(page);
  });

  test("authentication surface never escapes the screen", async ({ page }) => {
    await page.getByRole("button", { name: "Sign in" }).first().click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expectInsideViewport(page, ".auth-modal");
    await expectMinimumTouchTarget(page.getByRole("button", { name: "Close" }), 40);
    await expectNoPageOverflow(page);
  });

  test("mobile and tablet navigation drawer remains complete and dismissible", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Touch navigation coverage");

    const history = page.getByRole("button", { name: "Open conversations" });
    await expect(history).toBeVisible();
    await expectMinimumTouchTarget(history, 40);
    await history.click();

    const sheet = page.getByRole("dialog", { name: "Conversations" });
    await expect(sheet).toBeVisible();
    await expectInsideViewport(page, ".mobile-nav-sheet");
    await expect(page.getByRole("button", { name: "New conversation Start with a clean context" })).toBeVisible();
    await expectMinimumTouchTarget(page.getByRole("button", { name: "Close conversations" }), 40);
    await expectNoPageOverflow(page);

    await page.getByRole("button", { name: "Close conversations" }).click();
    await expect(sheet).toBeHidden();
  });

  test("desktop sidebar and primary workspace divide cleanly", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop layout coverage");

    await expect(page.locator(".chat-sidebar")).toBeVisible();
    const sidebar = await page.locator(".chat-sidebar").boundingBox();
    const main = await page.locator(".chat-main").boundingBox();
    expect(sidebar).not.toBeNull();
    expect(main).not.toBeNull();
    expect(sidebar!.x + sidebar!.width).toBeLessThanOrEqual(main!.x + 1);
    expect(main!.x + main!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    await expectNoPageOverflow(page);
  });
});
