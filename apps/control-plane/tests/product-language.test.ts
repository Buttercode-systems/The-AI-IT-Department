import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layoutPath = new URL("../app/layout.tsx", import.meta.url);
const stylesPath = new URL("../app/product-language.css", import.meta.url);

test("root layout loads the unified product language last", async () => {
  const layout = await readFile(layoutPath, "utf8");
  const manageIndex = layout.indexOf('import "./manage.css"');
  const productIndex = layout.indexOf('import "./product-language.css"');

  assert.ok(productIndex > manageIndex);
  assert.match(layout, /calm command centre for delegating work/i);
});

test("product language covers core, mobile, and dark surfaces", async () => {
  const styles = await readFile(stylesPath, "utf8");

  assert.match(styles, /\.chat-sidebar/);
  assert.match(styles, /\.composer/);
  assert.match(styles, /\.auth-modal/);
  assert.match(styles, /\.approval-card/);
  assert.match(styles, /\.manage-page/);
  assert.match(styles, /@media \(max-width: 820px\)/);
  assert.match(styles, /@media \(prefers-color-scheme: dark\)/);
});
