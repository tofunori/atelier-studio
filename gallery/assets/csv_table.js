(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AtelierCsv = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DELIMITERS = [",", ";", "\t"];

  function delimiterCounts(text, delimiter, maxRecords) {
    const counts = [];
    let quoted = false;
    let count = 0;
    for (let i = 0; i < text.length && counts.length < maxRecords; i += 1) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') i += 1;
        else quoted = !quoted;
      } else if (!quoted && char === delimiter) {
        count += 1;
      } else if (!quoted && (char === "\n" || char === "\r")) {
        if (char === "\r" && text[i + 1] === "\n") i += 1;
        if (count || counts.length) counts.push(count);
        count = 0;
      }
    }
    if (count) counts.push(count);
    return counts;
  }

  function detectDelimiter(text) {
    let best = {delimiter: ",", score: -1};
    for (const delimiter of DELIMITERS) {
      const counts = delimiterCounts(String(text || ""), delimiter, 12);
      if (!counts.length) continue;
      const nonZero = counts.filter(Boolean);
      const average = nonZero.reduce((sum, value) => sum + value, 0) / Math.max(1, nonZero.length);
      const consistency = nonZero.filter(value => Math.abs(value - average) < 0.5).length;
      const score = consistency * 100 + nonZero.length * 10 + average;
      if (score > best.score) best = {delimiter, score};
    }
    return best.delimiter;
  }

  function parse(text, requestedDelimiter) {
    const source = String(text || "");
    const delimiter = requestedDelimiter || detectDelimiter(source);
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    for (let i = 0; i < source.length; i += 1) {
      const char = source[i];
      if (char === '"') {
        if (quoted && source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if (!quoted && char === delimiter) {
        row.push(cell);
        cell = "";
      } else if (!quoted && (char === "\n" || char === "\r")) {
        if (char === "\r" && source[i + 1] === "\n") i += 1;
        row.push(cell);
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }
    if (cell !== "" || row.length) {
      row.push(cell);
      if (row.length > 1 || row[0] !== "") rows.push(row);
    }
    const width = rows.reduce((max, current) => Math.max(max, current.length), 0);
    for (const current of rows) while (current.length < width) current.push("");
    return {delimiter, rows, width};
  }

  function classify(value) {
    const text = String(value == null ? "" : value);
    const trimmed = text.trim();
    if (!trimmed) return "empty";
    if (/^(true|false)$/i.test(trimmed)) return "boolean";
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return "color";
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) return "number";
    if (/^(?:~|\.{0,2}\/|\/|[A-Za-z]:\\)|[\\/][^\s]+[\\/]/.test(trimmed)) return "path";
    return "text";
  }

  function compare(a, b) {
    const kindA = classify(a);
    const kindB = classify(b);
    if (kindA === "number" && kindB === "number") return Number(a) - Number(b);
    if (kindA === "boolean" && kindB === "boolean") return String(a).localeCompare(String(b));
    return String(a).localeCompare(String(b), undefined, {numeric: true, sensitivity: "base"});
  }

  return {detectDelimiter, parse, classify, compare};
});
