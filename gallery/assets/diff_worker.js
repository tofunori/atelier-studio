"use strict";

const token = new URLSearchParams(self.location.search).get("token");
importScripts("/.fig_thumbs/diff.min.js" + (token ? "?token=" + encodeURIComponent(token) : ""));

let activeRequestId = 0;

async function hybridDiff(before, after, requestId) {
  if (before.length + after.length <= 50000) return Diff.diffWordsWithSpace(before, after);
  const lines = Diff.diffLines(before, after);
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    if (requestId !== activeRequestId) return null;
    const part = lines[i];
    if (part.removed && lines[i + 1]?.added) {
      result.push(...Diff.diffWordsWithSpace(part.value, lines[i + 1].value));
      i++;
    } else if (part.added && lines[i + 1]?.removed) {
      result.push(...Diff.diffWordsWithSpace(lines[i + 1].value, part.value));
      i++;
    } else result.push(part);
    if (i % 20 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return result;
}

self.onmessage = async ({data}) => {
  const requestId = Number(data?.requestId);
  if (!Number.isFinite(requestId) || typeof data?.before !== "string" || typeof data?.after !== "string") return;
  activeRequestId = requestId;
  try {
    const parts = await hybridDiff(data.before, data.after, requestId);
    if (parts && activeRequestId === requestId) self.postMessage({requestId, parts});
  } catch (error) {
    if (activeRequestId === requestId) self.postMessage({requestId, error: String(error?.message || error)});
  }
};
