import pty from "node-pty";
import { homedir } from "node:os";

// Terminaux PTY par onglet Studio (shell de login, cwd = projet)
const terms = new Map(); // termId -> pty

export function open({ termId, cwd, cols, rows }, broadcast) {
  if (terms.has(termId)) return;
  const shell = process.env.SHELL || "/bin/zsh";
  const p = pty.spawn(shell, ["-l"], {
    name: "xterm-256color",
    cols: cols || 80,
    rows: rows || 24,
    cwd: cwd || homedir(),
    env: { ...process.env, TERM: "xterm-256color" },
  });
  terms.set(termId, p);
  p.onData((data) => broadcast({ type: "termData", termId, data }));
  p.onExit(({ exitCode }) => {
    terms.delete(termId);
    broadcast({ type: "termExit", termId, exitCode });
  });
}

export function input(termId, data) {
  terms.get(termId)?.write(data);
}

export function resize(termId, cols, rows) {
  try {
    terms.get(termId)?.resize(cols, rows);
  } catch {}
}

export function close(termId) {
  try {
    terms.get(termId)?.kill();
  } catch {}
  terms.delete(termId);
}
