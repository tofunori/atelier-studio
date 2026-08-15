import test from "node:test";
import assert from "node:assert/strict";
import {isZeroedToken} from "../shared.mjs";

// SEC-08 : un ancien bug côté Rust (`atelier-gallery`) pouvait écrire un
// jeton galerie constant (32 octets à zéro, encodés hex) quand /dev/urandom
// était inaccessible et l'échec ignoré silencieusement. `isZeroedToken` est
// le garde partagé qui empêche shared.mjs de faire confiance à ce jeton.
test("isZeroedToken flags an all-zero hex token", () => {
  assert.equal(isZeroedToken("0".repeat(64)), true);
  assert.equal(isZeroedToken("0"), true);
});

test("isZeroedToken accepts real hex tokens and rejects empty/garbage", () => {
  assert.equal(isZeroedToken("a1b2c3d4e5f6".repeat(5) + "0000"), false);
  assert.equal(isZeroedToken(""), false);
  assert.equal(isZeroedToken(undefined), false);
  assert.equal(isZeroedToken(null), false);
  // Un jeton commençant par des zéros mais pas uniquement des zéros reste valide.
  assert.equal(isZeroedToken("00000000deadbeef"), false);
});
