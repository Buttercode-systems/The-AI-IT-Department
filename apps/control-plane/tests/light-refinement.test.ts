import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layoutPath = new URL("../app/layout.tsx", import.meta.url);
const stylesPath = new URL("../app/light-refinement.css", import.meta.url);

test("root layout loads the restrained light refinement last", async () => {
  const layout = await readFile(layoutPath, "utf8");
  const manageIndex = layout.indexOf('import "./manage.css"');
  const refinementIndex = layout.indexOf('import "./light-refinement.css"');

  assert.ok(refinementIndex > manageIndex);
  assert.doesNotMatch(layout, /product-language\.css/);
});

test("refinement stays light and improves core interaction surfaces", async () => {
  const styles = await readFile(stylesPath, "utf8");

  assert.match(styles, /color-scheme:\s*light/);
  assert.match(styles, /\.starter-grid button:nth-child\(1\)::before/);
  assert.match(styles, /\.composer:focus-within/);
  assert.match(styles, /\.thread-list button\.active/);
  assert.match(styles, /@media \(max-width: 820px\)/);
  assert.doesNotMatch(styles, /background:\s*#0[0-9a-f]{2,5}/i);
});
