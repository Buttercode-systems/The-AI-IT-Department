import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL("../app/page.tsx", import.meta.url);
const cssPath = new URL("../app/mobile-release.css", import.meta.url);

test("mobile conversations provide back and history navigation", async () => {
  const [source, styles] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(cssPath, "utf8"),
  ]);

  assert.match(source, /className="mobile-back"/);
  assert.match(source, /className="mobile-history"/);
  assert.match(source, /className="mobile-nav-sheet"/);
  assert.match(source, /function returnToChatHome\(\)/);
  assert.match(source, /setMobileNavOpen\(false\)/);
  assert.match(styles, /@media\(max-width:820px\)/);
  assert.match(styles, /env\(safe-area-inset-bottom/);
  assert.match(styles, /min-height:44px/);
});
