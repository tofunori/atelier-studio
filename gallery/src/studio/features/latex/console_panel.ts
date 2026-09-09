import {parseLatexLogDiagnostics, type LatexCompileLog, type CompileChipKind} from './compile';

/** The console consumes the real coordinator state; it never starts its own build. */
export function createLatexConsolePanel(doc: Document, win: Window, compile: () => void, reveal: (line: number) => void) {
  const panel = doc.getElementById('texlog') as HTMLElement;
  const build = doc.getElementById('build') as HTMLButtonElement;
  const status = doc.getElementById('tlStatus') as HTMLElement;
  const issues = doc.getElementById('tlIssues') as HTMLElement;
  const journal = doc.getElementById('tlBody') as HTMLElement;
  const problemsTab = doc.getElementById('tlProblemsTab') as HTMLButtonElement;
  const logTab = doc.getElementById('tlLogTab') as HTMLButtonElement;
  const copy = doc.getElementById('tlCopy') as HTMLButtonElement;
  const retry = doc.getElementById('tlRetry') as HTMLButtonElement;
  const chat = doc.getElementById('tlChat') as HTMLButtonElement;
  const resize = doc.getElementById('tlResize') as HTMLElement;
  let rawLog = '', running = false;
  const originalIcon = build.querySelector('svg')!.outerHTML;
  const glyph = (path: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const icons = {run:glyph('<path d="M12 3a9 9 0 1 1-9 9"/>'),ok:glyph('<path d="m5 12 4 4L19 6"/>'),err:glyph('<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>')};
  function tab(log: boolean) {
    journal.hidden = !log; issues.hidden = log;
    problemsTab.setAttribute('aria-pressed', String(!log)); logTab.setAttribute('aria-pressed', String(log));
  }
  const open = (force?: boolean) => panel.classList.toggle('open', force ?? !panel.classList.contains('open'));
  const availableHeight = () => Math.max(120, Math.min(380, Math.floor(win.innerHeight * .6)));
  function height(value: number) {
    const next = Math.max(120, Math.min(availableHeight(), value));
    panel.style.height = `${next}px`; resize.setAttribute('aria-valuenow', String(next));
    resize.setAttribute('aria-valuemax', String(availableHeight()));
  }
  height(180);
  resize.onpointerdown = event => {
    event.preventDefault(); const y = event.clientY, initial = panel.getBoundingClientRect().height;
    resize.setPointerCapture(event.pointerId);
    resize.onpointermove = e => height(initial + y - e.clientY);
    resize.onpointerup = resize.onpointercancel = () => { resize.onpointermove = null; };
  };
  resize.onkeydown = event => {
    if (!['ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    event.preventDefault(); const current = Number(resize.getAttribute('aria-valuenow'));
    height(event.key === 'Home' ? 120 : event.key === 'End' ? availableHeight() : current + (event.key === 'ArrowUp' ? 20 : -20));
  };
  const onResize = () => height(Number(resize.getAttribute('aria-valuenow')));
  win.addEventListener('resize', onResize);
  problemsTab.onclick = () => tab(false); logTab.onclick = () => tab(true);
  retry.onclick = () => { if (!running) compile(); };
  copy.onclick = async () => {
    try { await win.navigator.clipboard.writeText(rawLog); copy.title = 'Journal copié'; }
    catch { tab(true); copy.title = 'Sélectionnez le journal pour le copier'; }
  };
  tab(false); copy.disabled = chat.disabled = true;
  function render(log: LatexCompileLog) {
    rawLog = log.log; journal.innerHTML = log.html; issues.replaceChildren();
    copy.disabled = chat.disabled = !rawLog;
    const diagnostics = parseLatexLogDiagnostics(rawLog);
    // Diagnostics without a source line still belong in Problems, without a misleading link.
    const unlocated = rawLog.split('\n').filter(line => /^! |^(?:LaTeX|Package .+|Class .+) Warning:|^(?:Overfull|Underfull)/.test(line))
      .map(line => ({message:line.replace(/^! /,''), severity:line.startsWith('! ') ? 'error' : 'warning', line:0}))
      .filter(item => !diagnostics.some(d => item.message.includes(d.message)));
    for (const item of [...diagnostics, ...unlocated]) {
      const row = doc.createElement('div'); row.className = 'tl-issue ' + item.severity;
      const text = doc.createElement('span'); text.textContent = item.message; row.append(text);
      if (item.line) { const link = doc.createElement('button'); link.textContent = `L. ${item.line} ↗`; link.onclick = () => reveal(item.line); row.append(link); }
      issues.append(row);
    }
    if (!issues.children.length) { const empty = doc.createElement('span'); empty.className = 'tl-empty'; empty.textContent = log.ok ? (log.warnings ? 'Avertissement — voir le journal.' : 'Aucun problème.') : rawLog.trim() || 'Échec de compilation — voir le journal.'; issues.append(empty); }
    (doc.getElementById('tlIssueCount') as HTMLElement).textContent = String(log.errors + log.warnings);
    if (!log.ok) { open(true); tab(false); }
  }
  return {
    open, render,
    state(kind: CompileChipKind, message: string) {
      running = kind === 'run'; build.dataset.compile = kind;
      build.querySelector('svg')!.outerHTML = icons[kind] || originalIcon;
      build.setAttribute('aria-busy', String(running)); build.disabled = retry.disabled = running;
      build.title = running ? message : kind === 'err' ? 'Échec — ouvrir la console via ⋯' : 'Compiler (⌘B)';
      status.textContent = running ? message : kind === 'err' ? 'Échec' : 'Réussie'; status.title = message;
      status.dataset.state = kind;
      if (kind === 'err') { open(true); }
    },
    dispose() { win.removeEventListener('resize', onResize); },
  };
}
