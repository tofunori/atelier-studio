import type { DeliveryStatus } from "../hooks/useDeliveryReceipts";

const DELIVERY_STATUS_TEXT: Record<DeliveryStatus, string> = {
  unconfirmed: "Envoi en attente de réception",
  received: "Envoi reçu par Atelier",
  started: "Réponse en cours",
  completed: "Réponse terminée",
  cancelled: "Envoi annulé",
  uncertain: "Effet fournisseur incertain, vérification requise",
  failed: "Envoi échoué",
  unknown: "État de l’envoi introuvable",
};

/** Région live invisible : annonce aux lecteurs d'écran l'état du dernier
 * envoi du fil actif (reçus de livraison). */
export function DeliveryStatusAnnouncer({ status }: { status: DeliveryStatus }) {
  return (
    <div className="sr-only" aria-live="polite" data-delivery-status={status}>
      {DELIVERY_STATUS_TEXT[status]}
    </div>
  );
}
