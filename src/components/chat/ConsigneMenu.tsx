import { nomConsigne, consignesSelectionnees } from "../../lib/consignes";
import { useState } from "react";
import { SlidersHorizontal, List, UserRound } from "lucide-react";
import { DropdownMenuSurface } from "../ui/DropdownMenuSurface";
import { RowButton } from "../ui/RowButton";
import type { Consigne, ConsigneDuFil } from "../../lib/consignes";
import { basculerForme, choisirSpecialiste, formesDuFil, type Specialiste } from "../../lib/specialistes";
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

/** Menu « Spécialiste » du compositeur (plan specialistes-2026-10-18) :
 *  le spécialiste du fil en haut, puis les consignes de forme (section
 *  « Forme de réponse », combinables). Le spécialiste dit quoi savoir, la
 *  forme dit comment répondre ; les deux voyagent dans la même copie.
 *
 *  Épuré le 2026-10-31 (variante C choisie par Thierry) : sans icône ni
 *  infobulle ; le rôle du spécialiste tient sur UNE ligne sous son nom
 *  (tronqué : la fiche complète vit dans les réglages). Les formes de
 *  réponse deviennent des pastilles combinables, et un seul lien mène aux
 *  réglages. */
export function ConsigneMenu(p: {
  consignes: Consigne[];
  actif: ConsigneDuFil | null;
  provider: string;
  onChoisir: (choix: ConsigneDuFil | null) => void;
  onOuvrirReglages: () => void;
  specialistes?: Specialiste[];
  onGererSpecialistes?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const supporte = PROVIDERS_AVEC_CONSIGNE.includes(p.provider);
  const specialiste = p.actif?.specialiste ?? null;
  const formes = formesDuFil(p.actif);
  const connue = formes ? p.consignes.find((c) => c.id === formes.id) : undefined;
  // Une consigne retirée du catalogue laisse le fil fonctionnel : on le dit
  // au lieu d'afficher un nom vide ou de perdre l'état.
  const nomFormes = (formes?.composition || formes?.selection) ? nomConsigne(formes, p.consignes) : formes ? (connue?.nom ?? t("chat.consigne-deleted")) : "";
  const pied = PIED_KEYS[p.provider as keyof typeof PIED_KEYS]
    ? t(PIED_KEYS[p.provider as keyof typeof PIED_KEYS])
    : undefined;

  // Rangée active : remplie + coche (spec 2026-09-01) — sans ça, ouvrir le
  // menu ne disait pas quel spécialiste est en vigueur.
  const rangeeSpecialiste = (actif: boolean) => (actif ? "specialiste-item on" : "specialiste-item");

  const selection = consignesSelectionnees(formes);
  const catalogue = [...p.consignes, ...selection.filter(c => !p.consignes.some(rule => rule.id === c.id)).map(c => ({
    ...c, nom:c.id === "atelier-anglais" ? t("consigne.english") : t("consigne.personal"), description:c.texte,
  }))];
  const visibles = (p.specialistes ?? []).filter((s) => s.visible || s.id === specialiste?.id);
  const specialistesItems = [
    {
      key: "specialiste-aucun",
      className: rangeeSpecialiste(!specialiste),
      label: (
        <>
          <span className="consigne-nom">{t("specialiste.none")}</span>
          {!specialiste && <CocheConsigne />}
        </>
      ),
      onSelect: () => p.onChoisir(choisirSpecialiste(p.actif, null)),
    },
    ...visibles.map((s) => ({
      key: `specialiste-${s.id}`,
      className: rangeeSpecialiste(specialiste?.id === s.id),
      label: (
        <>
          <span className="consigne-option">
            <span className="consigne-nom">{s.nom || t("specialistes.untitled")}</span>
            {s.role && <span className="consigne-desc">{s.role}</span>}
          </span>
          {specialiste?.id === s.id && <CocheConsigne />}
        </>
      ),
      onSelect: () => p.onChoisir(choisirSpecialiste(p.actif, specialiste?.id === s.id ? null : s)),
    })),
    // Fiche du fil absente du catalogue (supprimée) : on la montre quand
    // même, cochée, pour que le menu dise ce que le fil porte encore.
    ...(specialiste && !visibles.some((s) => s.id === specialiste.id) ? [{
      key: `specialiste-${specialiste.id}`,
      className: rangeeSpecialiste(true),
      label: (
        <>
          <span className="consigne-option">
            <span className="consigne-nom">{specialiste.nom}</span>
            <span className="consigne-desc">{t("specialiste.deleted")}</span>
          </span>
          <CocheConsigne />
        </>
      ),
      onSelect: () => p.onChoisir(choisirSpecialiste(p.actif, null)),
    }] : []),
  ];
  // Formes de réponse en pastilles (cases à cocher du menu, disposées en
  // ligne) : le nom suffit, la glose reste dans les réglages des consignes.
  const formesItems = catalogue.map((c) => ({
    key: c.id,
    checked: selection.some(rule => rule.id === c.id),
    className: "consigne-pastille",
    label: <span className="consigne-nom">{c.nom}</span>,
    onSelect: () => p.onChoisir(basculerForme(p.actif, c)),
  }));
  const reglagesItems = [{
    key: "reglages",
    label: <><SlidersHorizontal aria-hidden="true" /><span className="consigne-lien">{t("specialiste.manage-all")}</span></>,
    onSelect: p.onGererSpecialistes ?? p.onOuvrirReglages,
  }];

  // Bouton du compositeur : le nom court du spécialiste et le nombre de
  // consignes de forme (« Glaciologue +2 », décision 2026-10-18) ; le nom
  // complet reste dans l'infobulle, l'en-tête du fil et le menu.
  const titre = !supporte ? t("consigne.unsupported")
    : specialiste ? [specialiste.nom, nomFormes].filter(Boolean).join(" · ")
    : (nomFormes || t("specialiste.menu-title"));
  const trigger = specialiste ? (
    <RowButton className="consigne-pilule specialiste-pilule" data-active="true"
      aria-label={t("specialiste.menu-title")} title={titre} disabled={!supporte}>
      <UserRound aria-hidden="true" />
      <span className="specialiste-pilule-nom">{specialiste.nomCourt || specialiste.nom}</span>
      {selection.length > 0 && <span className="specialiste-pilule-formes">+{selection.length}</span>}
    </RowButton>
  ) : (
    <RowButton
      className={p.actif ? "consigne-pilule" : "consigne-trigger"}
      data-active={Boolean(p.actif) || open}
      aria-label={t("specialiste.menu-title")}
      title={titre}
      disabled={!supporte}>
      <GlypheConsigne />
      {p.actif ? <span className="consigne-pilule-nom">{nomFormes}</span> : null}
    </RowButton>
  );

  return (
    <DropdownMenuSurface
      open={open}
      onOpenChange={setOpen}
      label={t("specialiste.menu-title")}
      className="composer-menu composer-style-menu"
      side="top"
      sideOffset={8}
      align="start"
      groups={[
        { key: "specialistes", label: <span className="consigne-heading">{t("specialiste.heading")}</span>, items: specialistesItems },
        // Le mode d'application propre au CLI (prompt système ou bloc en
        // tête) reste consultable au survol du titre, sans ligne de pied.
        { key: "formes", separatorBefore: true, label: <span className="consigne-heading" title={pied}>{t("specialiste.forms")}</span>, items: formesItems, className: "consigne-pastilles" },
        { key: "reglages", separatorBefore: true, items: reglagesItems },
      ]}
      trigger={trigger}
    />
  );
}
