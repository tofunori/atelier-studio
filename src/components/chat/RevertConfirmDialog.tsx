// Confirmation du « Revert : rembobiner » (audit du 2026-10-18, problème 3).
// Rembobiner tronque le fil et, si le tour a un checkpoint, remet ses fichiers
// dans leur état d'avant le tour : l'action ne part plus sur un simple clic.
// Le même dialogue sert au second temps, quand le serveur signale des
// fichiers modifiés APRÈS la fin du tour (`revertNeedsConfirm`) : la liste est
// montrée et rien n'est écrasé sans un « oui » explicite.
import { t } from "../../lib/i18n";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../shadcn/alert-dialog";

const MAX_PATHS = 8;

export function RevertConfirmDialog(p: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  paths?: string[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const paths = p.paths ?? [];
  const hidden = paths.length - MAX_PATHS;
  return (
    <AlertDialog open={p.open} onOpenChange={(open) => { if (!open) p.onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{p.title}</AlertDialogTitle>
          <AlertDialogDescription>{p.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {paths.length > 0 && (
          <ul className="revert-confirm-paths" aria-label={t("chat.revert-paths")}>
            {paths.slice(0, MAX_PATHS).map((path) => <li key={path}>{path}</li>)}
            {hidden > 0 && <li>{t("chat.revert-paths-more", { count: hidden })}</li>}
          </ul>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={p.onConfirm}>{p.confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
