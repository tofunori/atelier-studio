import { useState } from "react";
import { DropdownMenuSurface } from "../ui/DropdownMenuSurface";
import { RowButton } from "../ui/RowButton";
import type { Consigne, ConsigneDuFil } from "../../lib/consignes";

/** CLIs qui savent porter une consigne (plan du 2026-09-01). */
export const PROVIDERS_AVEC_CONSIGNE = ["claude", "codex"];

const PIEDS: Record<string, string> = {
  claude: "Sur claude : appliquée en système, invisible dans le fil.",
  codex: "Sur codex : ajoutée en tête de chaque message.",
};

function GlypheConsigne() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"
         strokeLinecap="round" aria-hidden="true">
      <circle cx="5" cy="7" r="1.4" />
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="5" cy="17" r="1.4" />
      <path d="M9.5 7H19M9.5 12H19M9.5 17H15" />
    </svg>
  );
}

export function ConsigneMenu(p: {
  consignes: Consigne[];
  actif: ConsigneDuFil | null;
  provider: string;
  onChoisir: (choix: ConsigneDuFil | null) => void;
  onOuvrirReglages: () => void;
}) {
  const [open, setOpen] = useState(false);
  const supporte = PROVIDERS_AVEC_CONSIGNE.includes(p.provider);
  const connue = p.actif ? p.consignes.find((c) => c.id === p.actif?.id) : undefined;
  // Une consigne retirée du catalogue laisse le fil fonctionnel : on le dit
  // au lieu d'afficher un nom vide ou de perdre l'état.
  const nom = p.actif ? (connue?.nom ?? "(supprimée)") : "";

  const items = [
    {
      key: "aucune",
      label: <span className="consigne-nom">Aucune</span>,
      onSelect: () => p.onChoisir(null),
    },
    ...p.consignes.map((c) => ({
      key: c.id,
      label: (
        <span className="consigne-option">
          <span className="consigne-nom">{c.nom}</span>
          <span className="consigne-desc">{c.description}</span>
        </span>
      ),
      onSelect: () => p.onChoisir({ id: c.id, texte: c.texte }),
    })),
    {
      key: "reglages",
      separatorBefore: true,
      label: <span className="consigne-lien">Modifier les consignes…</span>,
      onSelect: p.onOuvrirReglages,
    },
  ];

  return (
    <DropdownMenuSurface
      open={open}
      onOpenChange={setOpen}
      label="Consigne du fil"
      footer={PIEDS[p.provider]}
      align="start"
      items={items}
      trigger={
        <RowButton
          className={p.actif ? "consigne-pilule" : "consigne-trigger"}
          aria-label="Consigne du fil"
          title={
            supporte
              ? (connue?.nom ?? "Consigne du fil")
              : "Consigne : pas encore supportée sur ce CLI"
          }
          disabled={!supporte}>
          <GlypheConsigne />
          {p.actif ? <span className="consigne-pilule-nom">{nom}</span> : null}
        </RowButton>
      }
    />
  );
}
