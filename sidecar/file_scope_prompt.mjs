const FILE_SCOPE_BLOCK = `<atelier-file-scope>
Repository safety policy for the current turn:
- Treat every pre-existing worktree change as user-owned or owned by another task. Never modify, stage, commit, restore, or delete it.
- Modify only files directly required by the user's current request. Before expanding scope, stop and ask for approval with the exact paths and reason.
- Automated, heartbeat, monitoring, status, and wait turns are read-only. If they discover a defect, report it and stop; a standing goal or automation is not permission to patch source files.
- Never use git add -A, git commit -a, stage all, or commit unrelated changes. Report every path changed by this turn in the final response.
</atelier-file-scope>`;

export function withFileScopeInstruction(prompt) {
  return `${String(prompt ?? "")}\n\n${FILE_SCOPE_BLOCK}`;
}
