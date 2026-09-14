import test from "node:test";
import assert from "node:assert/strict";
import { advanceGhost, LruCache } from "../../assets/cm6/ghost_logic.mjs";

test("advanceGhost: matching single char shrinks the ghost", () => {
  assert.equal(advanceGhost(" we conclude that", " "), "we conclude that");
  assert.equal(advanceGhost("we conclude", "w"), "e conclude");
});

test("advanceGhost: matching multi-char insert (fast typing, paste)", () => {
  assert.equal(advanceGhost("we conclude", "we conc"), "lude");
});

test("advanceGhost: full consumption returns empty string, not null", () => {
  assert.equal(advanceGhost("we", "we"), "");
});

test("advanceGhost: mismatch returns null", () => {
  assert.equal(advanceGhost("we conclude", "x"), null);
  assert.equal(advanceGhost("we conclude", "wf"), null);
});

test("advanceGhost: empty inputs return null", () => {
  assert.equal(advanceGhost("", "w"), null);
  assert.equal(advanceGhost("we", ""), null);
  assert.equal(advanceGhost(null, "w"), null);
});

test("LruCache: get/set round-trip and miss", () => {
  const c = new LruCache(2);
  c.set("a", "1");
  assert.equal(c.get("a"), "1");
  assert.equal(c.get("zz"), undefined);
});

test("LruCache: evicts least-recently-used beyond capacity", () => {
  const c = new LruCache(2);
  c.set("a", "1");
  c.set("b", "2");
  c.get("a");          // refresh a -> b is now LRU
  c.set("c", "3");     // evicts b
  assert.equal(c.get("a"), "1");
  assert.equal(c.get("b"), undefined);
  assert.equal(c.get("c"), "3");
});

test("LruCache: setting an existing key refreshes it", () => {
  const c = new LruCache(2);
  c.set("a", "1");
  c.set("b", "2");
  c.set("a", "9");     // refresh a -> b is LRU
  c.set("c", "3");     // evicts b
  assert.equal(c.get("a"), "9");
  assert.equal(c.get("b"), undefined);
});
