const FILE_SCOPE_BLOCK = `<atelier-file-scope>
Repository safety policy for the current turn:
- Treat every pre-existing worktree change as user-owned or owned by another task. Preserve it: never overwrite, restore, delete, or silently include unrelated existing work in this turn.
- A dirty file may be modified when directly required by the user's current request. Preserve unrelated hunks, inspect the diff before and after editing, and limit changes to the requested task.
- A clear user request to edit, integrate, stage, commit, or push is sufficient authorization for that action within the stated scope; do not demand special exception wording. If the scope is ambiguous, ask one concrete question naming the exact paths and action.
- Automated, heartbeat, monitoring, status, and wait turns are read-only. If they discover a defect, report it and stop; a standing goal or automation is not permission to patch source files.
- Never use git add -A, git commit -a, stage all, or commit unrelated changes. Stage only explicitly requested changes, using exact paths or hunks as needed.
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
