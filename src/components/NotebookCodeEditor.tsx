// Édition d'une cellule de code comme dans Jupyter : un clic dans le code, et
// la coloration reste. Une zone de saisie transparente est posée exactement
// sur le code coloré (même police, mêmes marges, même retour à la ligne) ;
// seul le curseur et la sélection de la zone se voient.
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { useLayoutEffect } from "react";

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
