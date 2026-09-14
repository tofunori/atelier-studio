import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
await import("../../assets/pdfjs_compat.js");
const compat = globalThis.AtelierPdfjsCompat;

/** Flux minimal façon WHATWG : getReader() → read()/cancel()/releaseLock(), sans Symbol.asyncIterator. */
function fakeStreamClass(chunks) {
  class FakeStream {
    constructor() { this.log = []; }
    getReader() {
      const queue = chunks.slice(); const log = this.log; let locked = true;
      return {
        read: async () => { if (!locked) throw new Error("reader released"); return queue.length ? {value: queue.shift(), done: false} : {value: undefined, done: true}; },
        cancel: async (reason) => { log.push("cancel:" + reason); queue.length = 0; },
        releaseLock: () => { locked = false; log.push("release"); },
      };
    }
  }
  return FakeStream;
}

test("le polyfill installe values() et Symbol.asyncIterator sur un flux qui n'en a pas", async () => {
  const Fake = fakeStreamClass([1, 2, 3]);
  assert.equal(typeof Fake.prototype[Symbol.asyncIterator], "undefined");
  assert.equal(compat.install(Fake.prototype), true);
  const s = new Fake(); const seen = [];
  for await (const x of s) seen.push(x);
  assert.deepEqual(seen, [1, 2, 3]);
  assert.deepEqual(s.log, ["release"], "le lecteur est libéré à la fin");
});

test("une sortie anticipée annule le flux (sauf preventCancel) et libère le lecteur", async () => {
  const Fake = fakeStreamClass(["a", "b", "c"]); compat.install(Fake.prototype);
  const s = new Fake();
  for await (const x of s) { if (x === "a") break; }
  assert.deepEqual(s.log, ["cancel:undefined", "release"]);
  const s2 = new Fake();
  for await (const x of s2.values({preventCancel: true})) { if (x === "a") break; }
  assert.deepEqual(s2.log, ["release"]);
});

test("un flux qui a déjà l'itérateur natif n'est pas touché", () => {
  class Native { getReader() {} async *[Symbol.asyncIterator]() {} }
  const before = Native.prototype[Symbol.asyncIterator];
  assert.equal(compat.install(Native.prototype), false);
  assert.equal(Native.prototype[Symbol.asyncIterator], before);
  assert.equal(compat.install(undefined), false);
});

test("contrat : les deux pages pdf.js chargent le polyfill AVANT le shim module", () => {
  for (const f of ["pdf_viewer.html", "latex_studio.html"]) {
    const html = fs.readFileSync(new URL("../../assets/" + f, import.meta.url), "utf8");
    const compatAt = html.indexOf('<script src="/.fig_thumbs/pdfjs_compat.js"></script>');
    const shimAt = html.indexOf("pdfjs/pdf.min.mjs");
    assert.ok(compatAt >= 0, f + " : pdfjs_compat.js absent");
    assert.ok(compatAt < shimAt, f + " : le polyfill doit précéder le shim pdf.js");
  }
});
