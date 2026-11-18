// Édition d'une cellule de code comme dans Jupyter : un clic dans le code, et
// la coloration reste. Une zone de saisie transparente est posée exactement
// sur le code coloré (même police, mêmes marges, même retour à la ligne) ;
// seul le curseur et la sélection de la zone se voient.
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { useLayoutEffect } from "react";

/** Position (en caractères) du point cliqué dans le texte d'un bloc. */
export function caretOffsetAt(block: HTMLElement, x: number, y: number): number | null {
  const doc = block.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let node: Node | null = null;
  let offset = 0;
  if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(x, y);
    node = pos?.offsetNode ?? null;
    offset = pos?.offset ?? 0;
  } else if (typeof doc.caretRangeFromPoint === "function") {
    const range = doc.caretRangeFromPoint(x, y);
    node = range?.startContainer ?? null;
    offset = range?.startOffset ?? 0;
  }
  if (!node || !block.contains(node)) return null;
  const before = doc.createRange();
  before.selectNodeContents(block);
  try {
    before.setEnd(node, offset);
  } catch {
    return null;
  }
  return before.toString().length;
}

export function NotebookCodeEditor({
  value,
  html,
  ariaLabel,
  textareaRef,
  caret,
  onChange,
  onKeyDown,
}: {
  value: string;
  /** Code coloré (hljs) de `value`. */
  html: string;
  ariaLabel: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** Où poser le curseur à l'ouverture (point cliqué) ; sinon à la fin. */
  caret?: number | null;
  onChange: (value: string) => void;
  onKeyDown: (ev: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  // Le curseur va là où l'on a cliqué, une seule fois à l'ouverture.
  useLayoutEffect(() => {
    const area = textareaRef.current;
    if (!area) return;
    const at = caret ?? area.value.length;
    area.focus({ preventScroll: true });
    area.setSelectionRange(at, at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="nb-code-edit">
      {/* Un saut de ligne final garde la dernière ligne vide visible. */}
      <pre className="nb-well nb-code-mirror" aria-hidden="true">
        <code className="hljs" dangerouslySetInnerHTML={{ __html: `${html}\n` }} />
      </pre>
      <textarea
        ref={textareaRef}
        className="nb-code-input"
        value={value}
        aria-label={ariaLabel}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
