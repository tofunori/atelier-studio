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
  onOpenDiff: () => void;
}) {
  if (!files.length) return null;
  return (
    <div className="changed-files-card">
      <div className="changed-files-head">
        <span>{t("chat.files-modified", { count: files.length })}</span>
        <RowButton className="changed-files-review" onClick={onOpenDiff}>{t("chat.see-diff")}</RowButton>
      </div>
      <div className="changed-files-list">
        {files.map((f) => (
          <RowButton key={f.path} className="changed-files-row" title={f.path} onClick={onOpenDiff}>
            <FileTypeIcon ext={f.name.split(".").pop() ?? ""} />
            <span className="changed-files-name">{f.name}</span>
            <span className="diff-add">+{f.add}</span>
            <span className="diff-del">−{f.del}</span>
          </RowButton>
        ))}
      </div>
    </div>
  );
}
