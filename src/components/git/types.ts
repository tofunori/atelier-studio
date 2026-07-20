export type GitFile = {
  path: string;
  status: string;
  originalPath?: string;
  add?: number;
  del?: number;
};

export type GitStatus = {
  branch: string | null;
  branches: string[];
  ahead: number;
  behind: number;
  files: GitFile[];
};

export type GitDiffContents = {
  before: string;
  after: string;
  binary: boolean;
};

export type GitGroup = "staged" | "changes" | "untracked";

export type SelectedFile = {
  path: string;
  group: GitGroup;
};

export type LedgerEntry = {
  ts: string;
  threadId: string;
  threadTitle?: string | null;
  provider?: string | null;
  model?: string | null;
  effort?: string | null;
  promptExcerpt?: string;
  usage?: { cost?: number | null } | null;
  tools?: { name?: string; status?: string | null }[];
  filesChanged?: string[];
  snapshotSha?: string | null;
};

export type GitCommitSummary = {
  sha: string; shortSha: string; parents: string[]; author: string; authorEmail: string;
  authoredAt: string; subject: string; decorations: string[];
};

export type GitCommitFile = { status: string; path: string; previousPath?: string };

export type GitCommitDetails = GitCommitSummary & {
  body: string; files: GitCommitFile[]; diff: string; head: string; upstream?: string | null;
  isHead: boolean; isPublished: boolean;
};

export type GitMode = "git" | "commits" | "journal";
export type SyncOperation = "push" | "pull" | "switch" | "create-branch" | "delete-branch" | "merge-branch";
