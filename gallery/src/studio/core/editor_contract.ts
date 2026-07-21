export interface StudioPosition {
  line: number;
  ch: number;
}

export interface StudioRange {
  from: StudioPosition;
  to: StudioPosition;
}

export interface StudioSelection extends StudioRange {
  anchor?: StudioPosition;
  head?: StudioPosition;
}

export interface StudioScrollInfo {
  left: number;
  top: number;
  height: number;
  width: number;
  clientHeight: number;
  clientWidth: number;
}

export interface StudioTextMarker {
  clear(): void;
  find(): StudioRange | undefined;
}

export interface StudioBookmark {
  clear(): void;
  find(): StudioPosition | undefined;
}

export type StudioEvent =
  | "change"
  | "changes"
  | "cursorActivity"
  | "focus"
  | "blur"
  | "gutterClick"
  | "scroll";

export interface StudioEditor {
  readonly hasNativeGhost: boolean;
  readonly hasNativeSelectionHighlight: boolean;
  readonly hasNativeMergeDiff?: boolean;
  getValue(): string;
  setValue(value: string): void;
  getSelection(): string;
  getCursor(which?: "from" | "to" | "anchor" | "head"): StudioPosition;
  setCursor(position: StudioPosition): void;
  setSelection(anchor: StudioPosition, head?: StudioPosition): void;
  replaceRange(text: string, from: StudioPosition, to?: StudioPosition, origin?: string): void;
  getLine(line: number): string;
  lineCount(): number;
  getRange(from: StudioPosition, to: StudioPosition): string;
  posFromIndex(index: number): StudioPosition;
  indexFromPos(position: StudioPosition): number;
  markText(from: StudioPosition, to: StudioPosition, options?: Record<string, unknown>): StudioTextMarker;
  setBookmark(position: StudioPosition, options?: Record<string, unknown>): StudioBookmark;
  operation<T>(callback: () => T): T;
  scrollIntoView(target: StudioPosition | StudioRange, margin?: number): void;
  scrollTo(left: number | null, top: number | null): void;
  getScrollInfo(): StudioScrollInfo;
  getViewportAnchor(): StudioPosition;
  getWrapperElement(): HTMLElement;
  focus(): void;
  refresh(): void;
  on(event: StudioEvent, callback: (...args: unknown[]) => void): void;
  off(event: StudioEvent, callback: (...args: unknown[]) => void): void;
  setOption(name: string, value: unknown): void;
  getOption(name: string): unknown;
  execCommand(command: string): void;
}

export interface StudioEditorOptions {
  parent: HTMLElement;
  value?: string;
  ext?: string;
  wrap?: boolean;
  readOnly?: boolean;
  defaultEngine?: "cm5" | "cm6";
  aiEnabled?: boolean | (() => boolean);
  onGhostState?: (state: unknown) => void;
  cm5Options?: Record<string, unknown>;
}

export interface StudioEditorFactory {
  resolveEngine(search: string, storage: Pick<Storage, "getItem"> | null, defaultEngine?: string): "cm5" | "cm6";
  createEditor(options: StudioEditorOptions): StudioEditor;
}
