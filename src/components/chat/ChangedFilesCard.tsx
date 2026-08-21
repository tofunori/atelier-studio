// Carte « N fichiers modifiés » en fin de tour (plan hermes-work-display,
// phase 2, tâche 5) : liste enrichie (icône + nom + +N/−M par fichier)
// au-dessus de la capsule résultat. N'ouvre AUCUN diff par elle-même — chaque
// ligne et le lien « Voir le diff » délèguent à `onOpenDiff`, qui déplie le
// même mécanisme que `DoneDiffToggle` (aucune logique de requête gitDiff
// dupliquée ici).
import { RowButton } from "../ui";
import { FileTypeIcon } from "./toolPresentation";
import { t } from "../../lib/i18n";
import type { ChangedFile } from "./changedFiles";

export function ChangedFilesCard({ files, onOpenDiff }: {
  files: ChangedFile[];
  /** null quand aucun chemin git n'est disponible pour ce tour (edits seuls,
   * sans done.filesChanged) — le diff a besoin de chemins git, donc ni le
   * lien « Voir le diff » ni les lignes ne sont cliquables dans ce cas. */
  onOpenDiff: (() => void) | null;
}) {
  if (!files.length) return null;
  return (
    <div className="changed-files-card">
      <div className="changed-files-head">
        <span>{t("chat.files-modified", { count: files.length })}</span>
        {onOpenDiff && (
          <RowButton className="changed-files-review" onClick={onOpenDiff}>{t("chat.see-diff")}</RowButton>
        )}
      </div>
      <div className="changed-files-list">
        {files.map((f) => (
          <RowButton key={f.path} className="changed-files-row" title={f.path} onClick={onOpenDiff ?? undefined} disabled={!onOpenDiff}>
            <FileTypeIcon ext={f.name.split(".").pop() ?? ""} />
            <span className="changed-files-name">{f.name}</span>
            {f.add != null && <span className="diff-add">+{f.add}</span>}
            {f.del != null && <span className="diff-del">−{f.del}</span>}
          </RowButton>
        ))}
      </div>
    </div>
  );
}
