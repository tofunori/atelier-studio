// Carte « N fichiers modifiés » en fin de tour (plan hermes-work-display,
// phase 2, tâche 5) : liste enrichie (icône + chemin + +N/−M par fichier)
// au-dessus de la capsule résultat. N'ouvre AUCUN diff par elle-même — le
// clic d'une ligne et le lien « Voir le diff » délèguent à `DoneDiffToggle`
// (aucune logique de requête gitDiff dupliquée ici) ; le diff d'un fichier
// s'affiche SOUS sa ligne (demande Thierry 2026-08-21).
import type { ReactNode } from "react";
import { RowButton } from "../ui";
import { FileTypeIcon, Tick } from "./toolPresentation";
import { t } from "../../lib/i18n";
import type { ChangedFile } from "./changedFiles";

export function ChangedFilesCard({ files, onOpenDiff, onToggleFile, openPaths, renderFileDiff, actions }: {
  files: ChangedFile[];
  /** null quand aucun chemin git n'est disponible pour ce tour (edits seuls,
   * sans done.filesChanged) — le diff a besoin de chemins git, donc ni le
   * lien « Voir le diff » ni les lignes ne sont cliquables dans ce cas. */
  onOpenDiff: (() => void) | null;
  /** ouvre/ferme le diff d'UN fichier ; null quand aucun diff n'est possible */
  onToggleFile?: ((path: string) => void) | null;
  /** chemins dont le diff est déplié */
  openPaths?: ReadonlySet<string>;
  /** corps du diff d'un fichier, fourni par le propriétaire de l'état */
  renderFileDiff?: (path: string) => ReactNode;
  /** actions du tour rendues DANS l'en-tête (annulation des fichiers) : hors
   * de la carte, elles flottaient sous un bloc auquel elles appartiennent. */
  actions?: ReactNode;
}) {
  if (!files.length) return null;
  const opened = openPaths ?? new Set<string>();
  const anyOpen = files.some((f) => opened.has(f.path));
  return (
    <div className="changed-files-card">
      <div className="changed-files-head">
        <span className="changed-files-count">{t("chat.files-modified", { count: files.length })}</span>
        {onOpenDiff && (
          <RowButton className="changed-files-review" onClick={onOpenDiff}>{t("chat.see-diff")}</RowButton>
        )}
        {actions}
      </div>
      <div className={`changed-files-list${anyOpen ? " is-expanded" : ""}`}>
        {files.map((f) => {
          // Dossier atténué + nom vif : deux `methods_en.tex` de dossiers
          // différents restent distinguables, et c'est le nom qu'on lit.
          const dir = f.path.length > f.name.length ? f.path.slice(0, f.path.length - f.name.length) : "";
          const isOpen = opened.has(f.path);
          return (
            <div className="changed-files-item" key={f.path}>
              <RowButton className="changed-files-row" title={f.path} aria-expanded={isOpen}
                onClick={onToggleFile ? () => onToggleFile(f.path) : undefined}
                disabled={!onToggleFile}>
                <FileTypeIcon ext={f.name.split(".").pop() ?? ""} />
                <span className="changed-files-path">
                  {dir && <span className="changed-files-dir">{dir}</span>}
                  <span className="changed-files-name">{f.name}</span>
                </span>
                {f.add != null && <span className="diff-add">+{f.add}</span>}
                {f.del != null && <span className="diff-del">−{f.del}</span>}
                {onToggleFile && <Tick open={isOpen} />}
              </RowButton>
              {isOpen && renderFileDiff && (
                <div className="changed-files-diff">{renderFileDiff(f.path)}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
