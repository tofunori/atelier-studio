// Feuille modale des réglages (lot A). Les réglages ne remplacent plus
// l'application : elle reste montée derrière le voile, ce qui rend visibles
// en direct les réglages de typographie du fil.
import { Dialog, DialogContent } from "../shadcn/dialog";
import SettingsPage from "./SettingsPage";
import type { Settings } from "../../lib/settings";
import { t } from "../../lib/i18n";
// CSS de la feuille de réglages (perf lot 2, tâche 6) : suit ce module dans
// son propre chunk async plutôt que de peser sur App.css au premier paint.
import "../../styles/settings-sheet.css";

/** Le contrat verrouillé : Échap ferme, JAMAIS pendant une saisie. */
function focusDansUnChamp(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function SettingsSheet(p: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (s: Settings) => void;
  ws: WebSocket | null;
  projects?: string[];
  projectRoot?: string;
  initialSection?: string;
}) {
  // Pas de `if (!p.open) return null` ici : ça arracherait le sous-arbre de
  // façon synchrone et couperait la transition de sortie à 120 ms déjà
  // câblée dans shadcn.css ([data-slot="dialog-content"][data-closed]).
  // `open` est lié directement à `p.open` — Base UI gère lui-même le
  // montage : `DialogPortal.keepMounted` vaut `false` par défaut, donc rien
  // n'est monté avant la première ouverture, et le démontage réel du
  // popup n'a lieu qu'après la fin de l'animation de fermeture (vérifié
  // dans node_modules/@base-ui/react/dialog/{portal,popup}/*.js :
  // `shouldRender = mounted || keepMounted`, `mounted` ne repasse à `false`
  // qu'une fois la transition « ending » terminée).
  return (
    <Dialog
      open={p.open}
      onOpenChange={(next, eventDetails) => {
        // Base UI Dialog est contrôlé : `onOpenChange` ne ferme rien de
        // lui-même, il demande. Le vrai verrou du contrat « Échap ne ferme
        // pas pendant une saisie » est de ne PAS propager `next` à l'état
        // React — `eventDetails.cancel()` seul ne suffirait pas (vérifié à
        // l'exécution par la sonde de la tâche 1, task-1-report.md).
        if (!next && eventDetails.reason === "escape-key" && focusDansUnChamp()) {
          eventDetails.cancel();
          return;
        }
        if (!next) p.onClose();
      }}
    >
      <DialogContent
        className="settings-sheet"
        showCloseButton={false}
        aria-label={t("settings.title")}
      >
        <SettingsPage
          settings={p.settings}
          onChange={p.onChange}
          onClose={p.onClose}
          ws={p.ws}
          projects={p.projects}
          projectRoot={p.projectRoot}
          initialSection={p.initialSection}
          embedded
        />
      </DialogContent>
    </Dialog>
  );
}
