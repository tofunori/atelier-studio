export type GitFile = {
  path: string;
  status: string;
  originalPath?: string;
  add?: number;
  del?: number;
};

export type GitStatus = {
  branch: string | null;
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

export type GitMode = "git" | "journal";
export type SyncOperation = "push" | "pull";
