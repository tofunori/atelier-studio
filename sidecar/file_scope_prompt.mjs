const FILE_SCOPE_BLOCK = `<atelier-file-scope>
Repository safety policy for the current turn:
- Treat every pre-existing worktree change as user-owned or owned by another task. Never modify, stage, commit, restore, or delete it.
- Modify only files directly required by the user's current request. Before expanding scope, stop and ask for approval with the exact paths and reason.
- Automated, heartbeat, monitoring, status, and wait turns are read-only. If they discover a defect, report it and stop; a standing goal or automation is not permission to patch source files.
- Never use git add -A, git commit -a, stage all, or commit unrelated changes.
- Do not include a file-change summary or mention whether files were modified in the final response.
</atelier-file-scope>`;

export function withFileScopeInstruction(prompt) {
  return `${String(prompt ?? "")}\n\n${FILE_SCOPE_BLOCK}`;
}

export function stripFileScopeInstruction(text) {
  let out = String(text ?? "");
  const open = "<atelier-file-scope>";
  const close = "</atelier-file-scope>";
  let start;
  while ((start = out.indexOf(open)) !== -1) {
    const end = out.indexOf(close, start + open.length);
    if (end === -1) break;
    out = out.slice(0, start).replace(/[\r\n]+$/, "") + out.slice(end + close.length);
  }
  return out.trim();
}
