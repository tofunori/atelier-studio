#!/usr/bin/env node
// Minimal stand-in for the Claude Code CLI in stream-json mode, for tests.
// Ignores argv. For each JSON line on stdin, replies ~150 ms later with a
// stream-json result line: {"type":"result","subtype":"success","result":"echo:<n>"}.
let n = 0;
let buf = "";
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    n += 1;
    const i = n;
    setTimeout(() => {
      process.stdout.write(JSON.stringify({ type: "result", subtype: "success", result: `echo:${i}` }) + "\n");
    }, 150);
  }
});
