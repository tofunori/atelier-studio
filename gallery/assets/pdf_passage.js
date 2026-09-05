(function(root, factory){
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AtelierPdfPassage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  function norm(value){
    return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function findPassageSpanRange(texts, quote){
    var ranges = [], joined = "";
    (texts || []).forEach(function(text, index){
      var clean = norm(text);
      if (!clean) return;
      if (joined) joined += " ";
      var start = joined.length;
      joined += clean;
      ranges.push({index:index, start:start, end:joined.length});
    });
    var needle = norm(quote);
    if (!joined || !needle) return null;
    var pos = joined.indexOf(needle), length = needle.length;
    if (pos < 0) {
      var words = needle.split(" ").filter(Boolean);
      for (var count = Math.min(18, words.length); count >= Math.min(5, words.length); count--){
        var anchor = words.slice(0, count).join(" ");
        pos = joined.indexOf(anchor);
        if (pos >= 0){ length = needle.length; break; }
      }
    }
    if (pos < 0) return null;
    var end = pos + length;
    var hits = ranges.filter(function(range){ return range.end > pos && range.start < end; });
    if (!hits.length) return null;
    return {start:hits[0].index, end:hits[hits.length - 1].index};
  }
  function findAllSpanRanges(texts, query){
    var matches = [], seen = new Set();
    // The second index tolerates PDF producers splitting a single word into
    // several glyph runs (and line-end hyphenation). It is only a search
    // index; selected/copied text remains the original PDF text.
    [false, true].forEach(function(compact){
      var joined = "", ranges = [];
      (texts || []).forEach(function(text, index){
        var value = norm(text); if (compact) value = value.replace(/ /g, "");
        if (!value) return;
        if (joined && !compact) joined += " ";
        ranges.push({index:index, start:joined.length, end:joined.length + value.length}); joined += value;
      });
      var needle = norm(query); if (compact) needle = needle.replace(/ /g, "");
      if (!needle) return;
      var at = 0;
      while ((at = joined.indexOf(needle, at)) >= 0 && matches.length < 10000) {
        var covered = ranges.filter(function(r){return r.end > at && r.start < at + needle.length;});
        if (covered.length) {
          var start = covered[0].index, end = covered[covered.length-1].index, key = start + ":" + end;
          if (!seen.has(key)) {seen.add(key); matches.push({start:start, end:end});}
        }
        at += needle.length;
      }
    });
    return matches.sort(function(a,b){return a.start-b.start || a.end-b.end;});
  }

  return {normalize:norm, findPassageSpanRange:findPassageSpanRange, findAllSpanRanges:findAllSpanRanges};
});
