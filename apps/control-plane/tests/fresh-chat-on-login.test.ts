import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL("../app/page.tsx", import.meta.url);

test("workspace bootstrap keeps conversation history but starts on a fresh chat", async () => {
  const source = await readFile(pagePath, "utf8");

  assert.match(source, /setConversations\(threads\.conversations\)/);
  assert.match(source, /setActiveConversationId\(null\); setMessages\(\[\]\); setView\("chat"\)/);
  assert.doesNotMatch(source, /if \(threads\.conversations\[0\]\) await openConversation/);
});
