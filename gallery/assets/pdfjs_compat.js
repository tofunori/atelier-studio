/* Compatibilité pdf.js ≥ 4 avec le WebKit système (Safari / WKWebView).
   pdf.js itère `page.streamTextContent()` avec `for await` dans
   getTextContent() — y compris dans sa variante « legacy ». Or le WebKit
   livré avec macOS (Version/26.6 le 2026-09-06) n'a pas encore
   ReadableStream.prototype[Symbol.asyncIterator] : la couche texte n'était
   jamais construite dans l'app (aucune sélection possible), alors que le
   WebKit de Playwright, plus récent, passait. Ce script DOIT être chargé
   avant le shim module de pdf.js (contrat : pdfjs_compat.test.mjs). */
(function (root) {
  "use strict";
  function values(options) {
    var reader = this.getReader();
    var preventCancel = !!(options && options.preventCancel);
    var it = {
      next: function () {
        return reader.read().then(function (r) {
          if (r.done) reader.releaseLock();
          return r;
        }, function (e) { reader.releaseLock(); throw e; });
      },
      return: function (value) {
        var p = preventCancel ? Promise.resolve() : Promise.resolve(reader.cancel(value)).catch(function () {});
        return p.then(function () { reader.releaseLock(); return { done: true, value: value }; });
      }
    };
    it[Symbol.asyncIterator] = function () { return it; };
    return it;
  }
  /** Installe values()/[Symbol.asyncIterator] sur un prototype de flux qui
   *  expose getReader() mais pas l'itérateur. Renvoie true si installé. */
  function install(proto) {
    if (!proto || typeof proto.getReader !== "function") return false;
    if (typeof proto[Symbol.asyncIterator] === "function") return false;
    Object.defineProperty(proto, "values", { value: values, writable: true, configurable: true });
    Object.defineProperty(proto, Symbol.asyncIterator, { value: values, writable: true, configurable: true });
    return true;
  }
  if (typeof root.ReadableStream === "function") install(root.ReadableStream.prototype);
  var api = { install: install };
  root.AtelierPdfjsCompat = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
