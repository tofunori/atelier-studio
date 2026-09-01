import { useState } from "react";
import { DropdownMenuSurface } from "../ui/DropdownMenuSurface";
import { RowButton } from "../ui/RowButton";
import type { Consigne, ConsigneDuFil } from "../../lib/consignes";
import { t } from "../../lib/i18n";

/** CLIs qui savent porter une consigne (plan du 2026-09-01). */
export const PROVIDERS_AVEC_CONSIGNE = ["claude", "codex"];

// Clés i18n, pas les chaînes elles-mêmes : résolues au RENDU (t() lit la
// langue courante) — un objet calculé au chargement du module figerait la
// langue de la première évaluation, insensible à un changement en cours de
// session (piège vérifié en revue, round 1).
const PIED_KEYS = {
  claude: "consigne.footer-claude",
  codex: "consigne.footer-codex",
} as const;

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
  const nom = p.actif ? (connue?.nom ?? t("chat.consigne-deleted")) : "";
  const pied = PIED_KEYS[p.provider as keyof typeof PIED_KEYS]
    ? t(PIED_KEYS[p.provider as keyof typeof PIED_KEYS])
    : undefined;

  const items = [
    {
      key: "aucune",
      label: <span className="consigne-nom">{t("consigne.none")}</span>,
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
      label: <span className="consigne-lien">{t("consigne.edit")}</span>,
      onSelect: p.onOuvrirReglages,
    },
  ];

  return (
    <DropdownMenuSurface
      open={open}
      onOpenChange={setOpen}
      label={t("consigne.menu-title")}
      footer={pied}
      align="start"
      items={items}
      trigger={
        <RowButton
          className={p.actif ? "consigne-pilule" : "consigne-trigger"}
          aria-label={t("consigne.menu-title")}
          title={
            supporte
              ? (connue?.nom ?? t("consigne.menu-title"))
              : t("consigne.unsupported")
          }
          disabled={!supporte}>
          <GlypheConsigne />
          {p.actif ? <span className="consigne-pilule-nom">{nom}</span> : null}
        </RowButton>
      }
    />
  );
}
