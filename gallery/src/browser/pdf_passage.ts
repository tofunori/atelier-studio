(function(root, factory){
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AtelierPdfPassage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, createAtelierPdfPassageApi);
function createAtelierPdfPassageApi(){
  function norm(value){
    return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function buildPart(texts, compact: boolean){
    var ranges = [], joined = "";
    (texts || []).forEach(function(text, index){
      var clean = norm(text);
      if (compact) clean = clean.replace(/ /g, "");
      if (!clean) return;
      if (joined && !compact) joined += " ";
      var start = joined.length;
      joined += clean;
      ranges.push({index:index, start:start, end:joined.length});
    });
    return {joined:joined, ranges:ranges};
  }
  function createIndex(texts){
    return {normal:buildPart(texts, false), compact:buildPart(texts, true)};
  }
  // Binary bounds keep a common single-letter search linear in its matches,
  // instead of scanning every PDF span again for each occurrence.
  function coveredRange(part, start: number, end: number){
    var ranges = part.ranges, lo = 0, hi = ranges.length;
    while (lo < hi) { var mid = (lo + hi) >>> 1; if (ranges[mid].end <= start) lo = mid + 1; else hi = mid; }
    var first = lo; hi = ranges.length;
    while (lo < hi) { var mid = (lo + hi) >>> 1; if (ranges[mid].start < end) lo = mid + 1; else hi = mid; }
    return first < lo ? {start:ranges[first].index, end:ranges[lo - 1].index} : null;
  }
  function findPassageInIndex(index, quote){
    var part = index.normal, joined = part.joined;
    var needle = norm(quote);
    if (!joined || !needle) return null;
    var pos = joined.indexOf(needle), length = needle.length;
    if (pos < 0) {
      // mots coupés en plusieurs glyphes ou césure de fin de ligne
      var compact = index.compact, flat = needle.replace(/ /g, ""), at = compact.joined.indexOf(flat);
      if (at >= 0) return coveredRange(compact, at, at + flat.length);
    }
    var words = needle.split(" ").filter(Boolean), count;
    if (pos < 0) {
      for (count = Math.min(18, words.length); count >= Math.min(5, words.length); count--){
        var anchor = words.slice(0, count).join(" ");
        pos = joined.indexOf(anchor);
        if (pos >= 0){ length = needle.length; break; }
      }
    }
    // Début abîmé (symbole mathématique, citation commencée sur la page
    // précédente) : la fin de la citation situe le passage.
    if (pos < 0) {
      for (count = Math.min(18, words.length); count >= Math.min(5, words.length); count--){
        var tail = words.slice(words.length - count).join(" "), found = joined.indexOf(tail);
        if (found >= 0){ pos = found; length = tail.length; break; }
      }
    }
    if (pos < 0) return null;
    var end = pos + length;
    return coveredRange(part, pos, end);
  }
  function findPassageSpanRange(texts, quote){ return findPassageInIndex(createIndex(texts), quote); }
  function findAllInIndex(index, query){
    var matches = [], seen = new Set();
    // The second index tolerates PDF producers splitting a single word into
    // several glyph runs (and line-end hyphenation). It is only a search
    // index; selected/copied text remains the original PDF text.
    [false, true].forEach(function(compact){
      var part = compact ? index.compact : index.normal, joined = part.joined;
      var needle = norm(query); if (compact) needle = needle.replace(/ /g, "");
      if (!needle) return;
      var at = 0;
      while ((at = joined.indexOf(needle, at)) >= 0 && matches.length < 10000) {
        var covered = coveredRange(part, at, at + needle.length);
        if (covered) {
          var start = covered.start, end = covered.end, key = start + ":" + end;
          if (!seen.has(key)) {seen.add(key); matches.push({start:start, end:end});}
        }
        at += needle.length;
      }
    });
    return matches.sort(function(a,b){return a.start-b.start || a.end-b.end;});
  }
  function findAllSpanRanges(texts, query){ return findAllInIndex(createIndex(texts), query); }

  return {normalize:norm, createIndex:createIndex, findPassageInIndex:findPassageInIndex,
    findAllInIndex:findAllInIndex, findPassageSpanRange:findPassageSpanRange, findAllSpanRanges:findAllSpanRanges};
}
export type AtelierPdfPassageApi = ReturnType<typeof createAtelierPdfPassageApi>;

