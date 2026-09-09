import { nomConsigne, consignesSelectionnees, basculerConsigne } from "../../lib/consignes";
import { useState } from "react";
import { FileText, GraduationCap, FlaskConical, MessageCircle, SlidersHorizontal, List } from "lucide-react";
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
  return <List aria-hidden="true" />;
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
  const nom = (p.actif?.composition || p.actif?.selection) ? nomConsigne(p.actif, p.consignes) : p.actif ? (connue?.nom ?? t("chat.consigne-deleted")) : "";
  const pied = PIED_KEYS[p.provider as keyof typeof PIED_KEYS]
    ? t(PIED_KEYS[p.provider as keyof typeof PIED_KEYS])
    : undefined;

  // Rangée active : « Aucune » quand le fil n'a pas de consigne, sinon celle
  // du fil. Marquée par un fond plein + une coche (spec 2026-09-01) — sans
  // ça, ouvrir le menu ne disait pas laquelle est en vigueur.
  const rangee = (actif: boolean) => (actif ? "consigne-item on" : "consigne-item");

  const selection = consignesSelectionnees(p.actif);
  const catalogue = [...p.consignes, ...selection.filter(c => !p.consignes.some(rule => rule.id === c.id)).map(c => ({
    ...c, nom:c.id === "atelier-anglais" ? t("consigne.english") : t("consigne.personal"), description:c.texte,
  }))];
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
    ...catalogue.map((c) => ({
      key: c.id,
      checked: selection.some(rule => rule.id === c.id),
      className: rangee(selection.some(rule => rule.id === c.id)),
      label: (
        <>
          {(() => { const Icon = c.id === "concis" ? FileText : c.id === "pedagogique" ? GraduationCap : c.id === "rigueur" ? FlaskConical : MessageCircle; return <Icon aria-hidden="true" />; })()}
          <span className="consigne-option">
            <span className="consigne-nom">{c.nom}</span>
            {/* La description se lit sous le nom et peut revenir à la ligne. */}
            <span className="consigne-desc" title={c.description}>
              {c.description}
            </span>
          </span>
        </>
      ),
      onSelect: () => p.onChoisir(basculerConsigne(p.actif, c)),
    })),
    {
      key: "reglages",
      separatorBefore: true,
      label: <><SlidersHorizontal aria-hidden="true" /><span className="consigne-lien">{t("consigne.edit")}</span></>,
      onSelect: p.onOuvrirReglages,
    },
  ];

  return (
    <DropdownMenuSurface
      open={open}
      onOpenChange={setOpen}
      label={t("consigne.menu-title")}
      className="composer-menu composer-style-menu"
      header={<span className="consigne-heading"><span>{t("consigne.heading")}</span><span className="consigne-subtitle">{t("consigne.combine")}</span></span>}
      footer={<span title={pied}>{t("consigne.active-count", { n: selection.length })}</span>}
      side="top"
      sideOffset={8}
      align="start"
      items={items}
      trigger={
        <RowButton
          className={p.actif ? "consigne-pilule" : "consigne-trigger"}
          data-active={Boolean(p.actif) || open}
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
