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
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
         strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <circle cx="5" cy="7" r="1.4" />
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="5" cy="17" r="1.4" />
      <path d="M9.5 7H19M9.5 12H19M9.5 17H15" />
    </svg>
  );
}

/** Coche de la rangée active. Le remplissage de la rangée porte déjà le
 *  signal (décision produit : aucun accent sur les consignes) — la coche
 *  le confirme sans couleur. */
function CocheConsigne() {
  return (
    <span className="consigne-coche" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
           strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 8.4 6.4 11.3 12.5 4.9" />
      </svg>
    </span>
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

  // Rangée active : « Aucune » quand le fil n'a pas de consigne, sinon celle
  // du fil. Marquée par un fond plein + une coche (spec 2026-09-01) — sans
  // ça, ouvrir le menu ne disait pas laquelle est en vigueur.
  const rangee = (actif: boolean) => (actif ? "consigne-item on" : "consigne-item");

  const items = [
    {
      key: "aucune",
      className: rangee(!p.actif),
      label: (
        <>
          <span className="consigne-nom">{t("consigne.none")}</span>
          {!p.actif && <CocheConsigne />}
        </>
      ),
      onSelect: () => p.onChoisir(null),
    },
    ...p.consignes.map((c) => ({
      key: c.id,
      className: rangee(p.actif?.id === c.id),
      label: (
        <>
          <span className="consigne-option">
            <span className="consigne-nom">{c.nom}</span>
            {/* Tronquée à droite : l'infobulle rend le texte entier, pour
                les consignes dont la description est longue. */}
            <span className="consigne-desc" title={c.description}>
              {c.description}
            </span>
          </span>
          {p.actif?.id === c.id && <CocheConsigne />}
        </>
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
