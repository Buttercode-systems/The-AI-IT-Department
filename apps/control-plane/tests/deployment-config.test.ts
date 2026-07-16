import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolve } from "node:path";

test("Vercel deployment policy protects preview quota and Hobby cron limits", async () => {
  const configPath = resolve(process.cwd(), "../../vercel.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as {
    ignoreCommand?: string;
    crons?: Array<{ path?: string; schedule?: string }>;
  };

  assert.match(config.ignoreCommand ?? "", /VERCEL_GIT_COMMIT_REF/);
  assert.match(config.ignoreCommand ?? "", /main/);

  const automationsCron = config.crons?.find((cron) => cron.path === "/api/cron/automations");
  assert.ok(automationsCron, "automation cron must be declared");
  assert.equal(automationsCron.schedule, "0 5 * * *", "Hobby plan cron must run no more than daily");
});
