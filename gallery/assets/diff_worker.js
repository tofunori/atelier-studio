"use strict";

const token = new URLSearchParams(self.location.search).get("token");
importScripts("/.fig_thumbs/diff.min.js" + (token ? "?token=" + encodeURIComponent(token) : ""));

let activeRequestId = 0;
const wsn = value => value.replace(/\s+/g, " ").trim();

async function gutterDiff(before, after, requestId) {
  const parts = Diff.diffLines(before, after), markers = [];
  let line = 0, blocks = 0;
  const lastLine = after.split("\n").length - 1;
  for(let i = 0; i < parts.length; i++){
    if(requestId !== activeRequestId) return null;
    const pt = parts[i], n = pt.count || 0;
    if(pt.removed){
      const nx = parts[i + 1];
      if(nx && nx.added && wsn(nx.value) === wsn(pt.value)){ line += nx.count || 0; i++; continue; }
      if(!wsn(pt.value)) continue;
      blocks++;
      if(nx && nx.added){
        const nn = nx.count || 0, changed = new Set();
        const wparts = Diff.diffWordsWithSpace(pt.value, nx.value), skip = new Set();
        for(let w = 0; w < wparts.length; w++){
          const wp = wparts[w];
          if(!(wp.added || wp.removed) || skip.has(w) || !wsn(wp.value)) continue;
          for(let x = w + 1; x <= w + 2 && x < wparts.length; x++){
            const cand = wparts[x];
            if(x === w + 1 && !cand.removed && !cand.added){ if(wsn(cand.value) !== "") break; continue; }
            if(!skip.has(x) && !!cand.removed === !wp.removed && !!cand.added === !wp.added
                && wsn(cand.value) === wsn(wp.value)){ skip.add(w); skip.add(x); }
            break;
          }
        }
        const lineOf = off => { let count = 0, pos = -1;
          for(;;){ const next = nx.value.indexOf("\n", pos + 1); if(next < 0 || next >= off) return count; count++; pos = next; } };
        let off = 0;
        for(let w = 0; w < wparts.length; w++){
          const wp = wparts[w];
          if(wp.removed){ if(!skip.has(w) && wsn(wp.value)) changed.add(lineOf(off)); continue; }
          if(wp.added && !skip.has(w) && wsn(wp.value)){
            const a = lineOf(off), b = lineOf(off + wp.value.length);
            for(let target = a; target <= b; target++) changed.add(target);
          }
          off += wp.value.length;
        }
        if(!changed.size){ blocks--; line += nn; i++; continue; }
        const lastChanged = Math.max(...changed);
        for(let k = 0; k < nn; k++) if(changed.has(k)) markers.push({line:Math.min(line+k,lastLine),
          openLine:line+k, kind:"modified", deleted:k===lastChanged && n>nn});
        line += nn; i++;
      } else {
        const at = Math.min(line,lastLine);
        markers.push({line:at,openLine:at,kind:"deleted",eof:line>lastLine});
      }
    } else {
      if(pt.added && wsn(pt.value)){
        blocks++;
        for(let k=0;k<n;k++) markers.push({line:Math.min(line+k,lastLine),openLine:line+k,kind:"added"});
      }
      line += n;
    }
    if(i % 20 === 0) await new Promise(resolve => setTimeout(resolve,0));
  }
  return {markers, blocks};
}

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
    if(data.kind === "gutter"){
      const gutter = await gutterDiff(data.before, data.after, requestId);
      if(gutter && activeRequestId === requestId) self.postMessage({requestId, gutter});
    } else {
      const parts = await hybridDiff(data.before, data.after, requestId);
      if (parts && activeRequestId === requestId) self.postMessage({requestId, parts});
    }
  } catch (error) {
    if (activeRequestId === requestId) self.postMessage({requestId, error: String(error?.message || error)});
  }
};
