#!/usr/bin/env node
// Read-only macOS RSS snapshots. WebKit is deliberately not attributed to Atelier.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [output, label = 'snapshot'] = process.argv.slice(2);
if (!output) {
  console.error('Usage: node scripts/sample-memory.mts OUTPUT.jsonl [phase]');
  process.exit(1);
}
// Depuis scripts/relance-app.sh, l'app tourne depuis ~/Applications/Atelier.app ;
// avant, depuis le target/ d'un worktree, ou /Applications pour le DMG. Tout
// bundle Atelier.app compte ; celui du target/ de ce checkout est préféré
// s'il tourne en même temps qu'un autre.
const APP_SUFFIX = '/Atelier.app/Contents/MacOS/tauri-app';
const checkoutBinary = resolve('src-tauri/target/release/bundle/macos' + APP_SUFFIX);
const processes = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,%cpu=,etime=,comm='], { encoding: 'utf8' })
  .trim().split('\n').flatMap(line => {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(\S+)\s+(.+)$/);
    return m ? [{ pid: +m[1], ppid: +m[2], rssKiB: +m[3], cpuPercent: +m[4], elapsed: m[5], command: m[6] }] : [];
  });
const apps = processes.filter(p => p.command.endsWith(APP_SUFFIX));
const fromCheckout = apps.filter(p => p.command === checkoutBinary);
const roots = fromCheckout.length === 1 ? fromCheckout : apps;
if (roots.length !== 1) throw new Error(`Expected one running Atelier.app; found ${roots.length}`);
const ids = new Set([roots[0].pid]);
let size;
do {
  size = ids.size;
  for (const p of processes) if (ids.has(p.ppid)) ids.add(p.pid);
} while (ids.size !== size);
const summarize = (p) => ({
  pid: p.pid, ppid: p.ppid, rssKiB: p.rssKiB, cpuPercent: p.cpuPercent,
  elapsed: p.elapsed,
  executable: p.command.match(/(?:\/|^)(tauri-app|atelier-[\w-]+|codex[\w.-]*|kimi|com\.apple\.WebKit\.\w+)(?=\s|$)/)?.[1] ?? 'other-child',
});
const owned = processes.filter(p => ids.has(p.pid));
const snapshot = {
  at: new Date().toISOString(), label, appPid: roots[0].pid,
  metric: 'RSS KiB, not physical footprint; shared pages can be counted more than once',
  ownedRssKiB: owned.reduce((sum, p) => sum + p.rssKiB, 0),
  owned: owned.map(summarize),
  unattributedWebKit: processes.filter(p => !ids.has(p.pid) && /\/com\.apple\.WebKit\.(WebContent|GPU|Networking)(?:\s|$)/.test(p.command)).map(summarize),
};
appendFileSync(output, JSON.stringify(snapshot) + '\n', { mode: 0o600 });
console.log(JSON.stringify(snapshot));
