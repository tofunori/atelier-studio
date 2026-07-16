// UiBench (plan 016, étape 5) — banc d'essai des douze primitives, monté par
// main.tsx quand l'URL porte #uibench (jamais dans le parcours normal).
// Sert aux captures de validation (deux thèmes) et à la revue manuelle
// clavier/focus. Pas de Storybook : une page, états canoniques, zéro réseau.
import { useEffect, useState } from "react";
// le banc court-circuite App.tsx : il charge lui-même les couches CSS,
// dans le même ordre que l'app
import "../../styles/tokens.css";
import "../../styles/shadcn.css";
import "../../styles/primitives.css";
import "../../App.css";
import "./UiBench.css";
import {
  Button,
  IconButton,
  Tooltip,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  SegmentedControl,
  SurfaceHeader,
  EmptyState,
  InlineNotice,
  StatusBadge,
  InspectorPanel,
  ContextChip,
} from "./index";
// import direct (pas via le barrel) : le banc est hors parcours normal,
// l'eager-load du chunk Base UI y est voulu
import { DropdownMenuSurface } from "./DropdownMenuSurface";

const GearIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
    <circle cx="8" cy="8" r="2.4" />
    <path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6L11 5M5 11l-1.4 1.4" />
  </svg>
);

export function UiBench() {
  // #uibench-light → départ en thème clair (captures one-shot reproductibles)
  const initialTheme = typeof window !== "undefined" && window.location.hash.includes("light") ? "light" : "dark";
  const [theme, setTheme] = useState<"dark" | "light">(initialTheme);
  useEffect(() => {
    if (initialTheme === "light") document.documentElement.setAttribute("data-theme", "light");
    return () => document.documentElement.removeAttribute("data-theme");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [seg, setSeg] = useState("split");
  const [effort, setEffort] = useState("medium");
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [popOpen, setPopOpen] = useState(false);
  const [chips, setChips] = useState<string[]>(["fig3_albedo.pdf", "notes.md"]);

  const applyTheme = (next: "dark" | "light") => {
    setTheme(next);
    if (next === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
  };

  return (
    <div className="ui-bench">
      <div className="ui-bench-top">
        <h1>Primitives UI — banc d'essai</h1>
        <span className="hint">#uibench · tokens.css + shadcn.css + primitives.css</span>
        <span className="spacer" />
        <SegmentedControl
          label="Thème"
          value={theme}
          onChange={(v) => applyTheme(v as "dark" | "light")}
          options={[
            { value: "dark", label: "Sombre" },
            { value: "light", label: "Clair" },
          ]}
        />
      </div>

      <div className="ui-bench-grid">
        <section className="ui-bench-card">
          <h2>Button</h2>
          <div className="ui-bench-row">
            <Button variant="primary">Envoyer</Button>
            <Button>Annuler</Button>
            <Button variant="ghost">Détails</Button>
            <Button variant="danger">Supprimer</Button>
          </div>
          <div className="ui-bench-row">
            <Button variant="primary" disabled>
              Envoyer
            </Button>
            <Button loading={loading} onClick={() => setLoading(!loading)}>
              Recharger l'index
            </Button>
            <Button variant="ghost" onClick={() => setLoading(!loading)}>
              {loading ? "Arrêter le loading" : "Relancer le loading"}
            </Button>
          </div>
          <span className="note">loading : géométrie constante, spinner superposé</span>
        </section>

        <section className="ui-bench-card">
          <h2>IconButton</h2>
          <div className="ui-bench-row">
            <IconButton label="Réglages (petit)" size="s">{GearIcon}</IconButton>
            <IconButton label="Réglages (moyen)">{GearIcon}</IconButton>
            <IconButton label="Réglages (grand)" size="l">{GearIcon}</IconButton>
            <IconButton label="Réglages (cible 40)" hit40>{GearIcon}</IconButton>
            <IconButton label="Réglages (inactif)" disabled>{GearIcon}</IconButton>
          </div>
          <span className="note">nom accessible obligatoire ; hit40 = cible étendue invisible</span>
        </section>

        <section className="ui-bench-card">
          <h2>Tooltip</h2>
          <div className="ui-bench-row">
            <Tooltip label="Apparaît après 420 ms, fondu 120 ms">
              <Button variant="ghost">Survolez-moi</Button>
            </Tooltip>
            <Tooltip label="Aussi au focus clavier" placement="bottom">
              <IconButton label="Aide">{GearIcon}</IconButton>
            </Tooltip>
          </div>
          <span className="note">hover rapide = jamais affiché ; Escape masque</span>
        </section>

        <section className="ui-bench-card">
          <h2>Menu</h2>
          <div className="ui-bench-row">
            <DropdownMenuSurface
              open={menuOpen}
              onOpenChange={setMenuOpen}
              label="Exemple"
              align="start"
              trigger={<Button>Ouvrir le menu</Button>}
              items={[
                { key: "new", label: "Nouvelle conversation", onSelect: () => {} },
                { key: "resume", label: "Reprendre une session…", onSelect: () => {} },
                { key: "export", label: "Exporter (bientôt)", onSelect: () => {}, disabled: true },
                { key: "delete", label: "Supprimer la conversation", onSelect: () => {}, destructive: true, separatorBefore: true },
              ]}
            />
          </div>
          {/* iframe témoin : le menu ouvert doit passer AU-DESSUS (gate 016
              « menus au-dessus des webviews/iframes », cas panneau Atelier) */}
          <iframe
            title="iframe témoin (empilement)"
            style={{ width: "100%", height: 72, border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-control)", background: "transparent" }}
            srcDoc="<body style='margin:0;display:flex;align-items:center;justify-content:center;background:#3a3f4b;color:#9aa0a6;font:11px system-ui'>iframe (le menu doit recouvrir ceci)</body>"
          />
          <span className="note">Base UI : flèches + Home/End, Escape rend le focus, item désactivé sauté</span>
        </section>

        <section className="ui-bench-card">
          <h2>Popover</h2>
          <Popover open={popOpen} onOpenChange={setPopOpen}>
            <div className="ui-bench-row">
              <PopoverTrigger render={<Button>Régler l'effort</Button>} />
            </div>
            <PopoverContent side="bottom" align="start" className="tw:min-w-52">
              <PopoverHeader>
                <PopoverTitle>Effort</PopoverTitle>
                <PopoverDescription>Choisir le niveau de raisonnement.</PopoverDescription>
              </PopoverHeader>
              <SegmentedControl
                label="Niveau d'effort"
                value={effort}
                onChange={setEffort}
                options={[
                  { value: "low", label: "Bas" },
                  { value: "medium", label: "Moyen" },
                  { value: "high", label: "Haut" },
                ]}
              />
              <Button variant="primary" onClick={() => setPopOpen(false)}>
                Appliquer
              </Button>
            </PopoverContent>
          </Popover>
          <span className="note">dialog non modal ; Escape rend le focus à l'ancre</span>
        </section>

        <section className="ui-bench-card">
          <h2>SegmentedControl</h2>
          <div className="ui-bench-row">
            <SegmentedControl
              label="Disposition"
              value={seg}
              onChange={setSeg}
              options={[
                { value: "chat", label: "Chat" },
                { value: "split", label: "Partagé" },
                { value: "atelier", label: "Atelier" },
              ]}
            />
            <StatusBadge>{seg}</StatusBadge>
          </div>
          <span className="note">radiogroup : un seul arrêt Tab, flèches = sélection</span>
        </section>

        <section className="ui-bench-card">
          <h2>SurfaceHeader</h2>
          <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-surface)", overflow: "hidden" }}>
            <SurfaceHeader
              eyebrow="Galerie"
              title="Albédo des glaciers — figures récentes avec un titre volontairement long"
              actions={
                <>
                  <IconButton label="Rafraîchir" size="s">{GearIcon}</IconButton>
                  <IconButton label="Réglages" size="s">{GearIcon}</IconButton>
                </>
              }
            />
            <div style={{ padding: "var(--sp-4)", color: "var(--text-muted)", fontSize: "var(--fs-body-s)" }}>
              corps de la surface
            </div>
          </div>
        </section>

        <section className="ui-bench-card">
          <h2>EmptyState</h2>
          <EmptyState
            title="Aucun projet ouvert"
            description="Choisissez un dossier pour démarrer l'atelier."
            actions={
              <>
                <Button>Nouvelle conversation</Button>
                <Button>Ouvrir un projet…</Button>
              </>
            }
          />
        </section>

        <section className="ui-bench-card">
          <h2>InlineNotice</h2>
          <InlineNotice>Index des figures à jour.</InlineNotice>
          <InlineNotice tone="success">Snapshot git créé.</InlineNotice>
          <InlineNotice tone="warning">Sonde galerie lente (2,1 s).</InlineNotice>
          <InlineNotice tone="error">Serveur galerie injoignable.</InlineNotice>
        </section>

        <section className="ui-bench-card">
          <h2>StatusBadge</h2>
          <div className="ui-bench-row">
            <StatusBadge>hors ligne</StatusBadge>
            <StatusBadge status="running">actif</StatusBadge>
            <StatusBadge status="success">ok</StatusBadge>
            <StatusBadge status="warning">latence</StatusBadge>
            <StatusBadge status="error">erreur</StatusBadge>
          </div>
          <span className="note">« running » = couleur accent, jamais d'animation (Quiet Instrument)</span>
        </section>

        <section className="ui-bench-card">
          <h2>InspectorPanel</h2>
          <div className="ui-bench-frame">
            <InspectorPanel
              eyebrow="Figure"
              title="fig3_albedo_saisonnier.pdf"
              onClose={() => {}}
              closeLabel="Fermer l'inspecteur"
              footer={<Button variant="primary">Appliquer</Button>}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "var(--fs-body-s)", color: "var(--text-secondary)" }}>
                <span>Source : MOD10A1.061</span>
                <span>Période : 2000–2025</span>
                <span>Grille : 500 m, EPSG:3413</span>
                <span>Dernière modification : 2026-07-08</span>
              </div>
            </InspectorPanel>
          </div>
        </section>

        <section className="ui-bench-card">
          <h2>ContextChip</h2>
          <div className="ui-bench-row">
            {chips.map((c) => (
              <ContextChip
                key={c}
                label={c}
                kind={c.endsWith(".pdf") ? "sel." : "fichier"}
                onRemove={() => setChips((xs) => xs.filter((x) => x !== c))}
                removeLabel={`Retirer ${c}`}
              />
            ))}
            <Button
              variant="ghost"
              onClick={() => setChips((xs) => [...xs, `extrait_${xs.length + 1}.txt`])}
            >
              Ajouter un chip
            </Button>
          </div>
          <span className="note">entrée : opacity + translateY(2px), 140 ms</span>
        </section>
      </div>
    </div>
  );
}
