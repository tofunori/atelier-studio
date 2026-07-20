import { workspaceTabId, type WorkspaceTabRef } from "./workspaceLayout";

export const WORKSPACE_POINTER_DRAG_START = "workspace-pointer-drag-start";

export type WorkspacePointerDragStartDetail = {
  ref: WorkspaceTabRef;
  clientX: number;
  clientY: number;
  pointerId: number;
};

let suppressClickUntil = 0;
let suppressedRefId: string | null = null;

export function dispatchWorkspacePointerDragStart(
  event: Pick<PointerEvent, "button" | "clientX" | "clientY" | "pointerId">,
  ref: WorkspaceTabRef,
): boolean {
  if (event.button !== 0) return false;
  window.dispatchEvent(new CustomEvent<WorkspacePointerDragStartDetail>(WORKSPACE_POINTER_DRAG_START, {
    detail: {
      ref,
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
    },
  }));
  return true;
}

export function markWorkspacePointerDragActivated(ref: WorkspaceTabRef) {
  suppressClickUntil = performance.now() + 600;
  suppressedRefId = workspaceTabId(ref);
}

export function shouldSuppressWorkspaceSourceClick(ref: WorkspaceTabRef): boolean {
  if (workspaceTabId(ref) !== suppressedRefId || performance.now() >= suppressClickUntil) return false;
  suppressClickUntil = 0;
  suppressedRefId = null;
  return true;
}
