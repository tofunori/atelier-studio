// Pose et retire la carte de mise à jour dans le Toaster global (Sonner,
// AppOverlays) selon l'état d'appUpdate, puis lance la vérification
// automatique. Chargé en différé par App : rien dans le budget d'entrée.
import { getUpdateState, startUpdateChecks, subscribeUpdate } from "../../lib/appUpdate";
import { UpdateCard } from "./UpdateCard";

const TOAST_ID = "atelier-update";
let mounted = false;

export async function mountUpdateCenter(): Promise<void> {
  if (mounted) return;
  mounted = true;
  const { toast } = await import("sonner");
  let shown = false;
  const sync = () => {
    const { cardOpen, phase } = getUpdateState();
    const visible = cardOpen && (phase.kind === "available" || phase.kind === "downloading"
      || phase.kind === "installing" || (phase.kind === "error" && phase.info != null));
    if (visible && !shown) {
      shown = true;
      toast.custom(() => <UpdateCard />, { id: TOAST_ID, duration: Infinity, dismissible: false, unstyled: true });
    } else if (!visible && shown) {
      shown = false;
      toast.dismiss(TOAST_ID);
    }
  };
  subscribeUpdate(sync);
  sync();
  await startUpdateChecks();
}
