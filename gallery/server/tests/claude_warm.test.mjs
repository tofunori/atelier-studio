import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { warmSuggest, stopWarm } from "../claude_warm.mjs";

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fake_claude.mjs");
const ENV = { ...process.env };
const CWD = process.cwd();

test("single request round-trips through the hot process", async () => {
  const r = await warmSuggest(FAKE, CWD, ENV, { before: "Hello ", after: "" });
  assert.equal(r.text, "echo:1");
  stopWarm();
});

test("request arriving mid-turn waits and runs next (trailing)", async () => {
  const p1 = warmSuggest(FAKE, CWD, ENV, { before: "one ", after: "" });
  const p2 = warmSuggest(FAKE, CWD, ENV, { before: "two ", after: "" });
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1.text, "echo:1");
  assert.equal(r2.text, "echo:2");          // ran after r1 settled, not dropped
  assert.ok(!r2.busy);
  stopWarm();
});

test("newest waiter wins; older waiter resolves superseded", async () => {
  const p1 = warmSuggest(FAKE, CWD, ENV, { before: "one ", after: "" });
  const p2 = warmSuggest(FAKE, CWD, ENV, { before: "two ", after: "" });
  const p3 = warmSuggest(FAKE, CWD, ENV, { before: "three ", after: "" });
  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
  assert.equal(r1.text, "echo:1");
  assert.equal(r2.superseded, true);        // replaced by p3 while waiting
  assert.equal(r2.text, "");
  assert.equal(r3.text, "echo:2");          // the trailing turn
  stopWarm();
});
