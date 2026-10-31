// Contrat CSS exécutable (plan 016) — jsdom ne calcule pas la cascade, donc
// les invariants Quiet Instrument sont vérifiés sur les SOURCES :
// - plus aucun `transition: all` dans src/ ;
// - budget : une seule @keyframes dans primitives.css (le spinner) ;
// - reduced motion : les trois tokens de durée passent à 0 ms centralement ;
// - primitives.css n'introduit AUCUNE durée en ms hors tokens (plafond 150 ms
//   garanti par construction).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const root = join(__dirname, "..", "..");
// le contrat porte sur les RÈGLES, pas sur les commentaires qui les citent
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = stripComments(readFileSync(join(root, "styles", "tokens.css"), "utf8"));
const primitives = stripComments(readFileSync(join(root, "styles", "primitives.css"), "utf8"));
const shadcn = stripComments(readFileSync(join(root, "styles", "shadcn.css"), "utf8"));
const shadcnButton = readFileSync(join(root, "components", "shadcn", "button.tsx"), "utf8");
const shadcnDialog = readFileSync(join(root, "components", "shadcn", "dialog.tsx"), "utf8");
const shadcnDir = join(root, "components", "shadcn");
const shadcnSources = readdirSync(shadcnDir)
  .filter((file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"))
  .map((file) => [file, readFileSync(join(shadcnDir, file), "utf8")] as const);
const appCss = stripComments(readFileSync(join(root, "App.css"), "utf8"));
const galleryMain = readFileSync(join(root, "..", "gallery", "react-ui", "main.tsx"), "utf8");
const galleryStyles = readFileSync(join(root, "..", "gallery", "react-ui", "styles.css"), "utf8");

// utilitaire : liste récursive des fichiers d'un répertoire filtrés par extension
const collectFiles = (dir: string, exts: string[]): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(p, exts));
    else if (exts.some((ext) => entry.name.endsWith(ext))) out.push(p);
  }
  return out;
};
// toutes les feuilles de style de composants (hors gallery/, hors shadcn/ qui
// n'en a pas) : ProjectFolders.css, ProjectGallery.css, UiBench.css, etc.
const componentCssFiles = collectFiles(join(root, "components"), [".css"]);

describe("contrat Quiet Instrument (sources CSS)", () => {
  it("les rôles visuels utilisés sans fallback possèdent une définition CSS", () => {
    const sheets = [appCss, ...collectFiles(join(root, "styles"), [".css"])
      .map((file) => stripComments(readFileSync(file, "utf8"))),
      ...componentCssFiles.map((file) => stripComments(readFileSync(file, "utf8")))].join("\n");
    const definitions = new Set([...sheets.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
    // Les variables de positionnement fournies par Base UI et les données de
    // visualisation sont hors de ce contrat; les rôles visuels appartiennent
    // au système de design et doivent se résoudre dès le chargement du CSS.
    const references = new Set([...sheets.matchAll(
      /var\(\s*(--(?:surface|text|border|status|radius|elevation|sp)-[\w-]+)\s*\)/g,
    )].map((match) => match[1]));
    expect([...references].filter((name) => !definitions.has(name)).sort()).toEqual([]);
  });

  it("aucun `transition: all` dans tokens/primitives/App.css", () => {
    for (const [name, css] of [
      ["tokens.css", tokens],
      ["primitives.css", primitives],
      ["App.css", appCss],
    ] as const) {
      expect(css.includes("transition: all"), `transition: all trouvé dans ${name}`).toBe(false);
      expect(css.includes("transition:all"), `transition:all trouvé dans ${name}`).toBe(false);
    }
    expect(shadcnButton).not.toContain("tw:transition-all");
    expect(shadcnButton).not.toContain("tw:dark:");
  });

  it("les sources générées restent compatibles avec les contrats Atelier", () => {
    for (const [name, source] of shadcnSources) {
      expect(source, `${name} contient une variante dark manuelle`).not.toContain("tw:dark:");
      expect(source, `${name} contient un z-index local`).not.toMatch(/tw:z-\d+/);
      expect(source, `${name} contient transition-all`).not.toContain("tw:transition-all");
      expect(source, `${name} contient un token vide généré`).not.toContain("tw: tw:");
      expect(source, `${name} utilise un espacement space-x/space-y`).not.toMatch(/tw:space-[xy]-/);
      expect(source, `${name} contient un séparateur HTML brut`).not.toContain("<hr");
    }
    expect(shadcn).toContain("--motion-fast");
    expect(shadcn).toContain("prefers-reduced-motion: reduce");
  });

  it("les primitives ne réintroduisent aucune valeur hors système (tailles/rayons/ombres/couleurs)", () => {
    for (const [name, source] of shadcnSources) {
      // tailles de texte : uniquement l'échelle 10/11/12/13/15 via tokens —
      // ni littéral px/rem, ni cran Tailwind non snappé par le pont
      expect(source, `${name} : taille de texte littérale hors tokens`).not.toMatch(
        /tw:text-\[[\d.]+(px|rem)\]/,
      );
      expect(source, `${name} : cran de texte Tailwind non snappé (base et +)`).not.toMatch(
        /tw:text-(base|lg|xl|2xl|3xl)\b/,
      );
      // rayons : 6/10/999 uniquement — aucun px littéral dans rounded-[...]
      expect(source, `${name} : rayon littéral hors système`).not.toMatch(
        /tw:rounded(-[a-z]+)?-\[[^\]]*\d+px[^\]]*\]/,
      );
      // profondeur : ombre uniquement via le token d'élévation
      expect(source, `${name} : preset d'ombre Tailwind au lieu de --elevation-overlay`).not.toMatch(
        /tw:shadow-(2xs|xs|sm|md|lg|xl|2xl)\b/,
      );
      // voile de modale : token --scrim, jamais une couleur brute
      expect(source, `${name} : couleur brute black/white`).not.toMatch(/tw:bg-(black|white)\b/);
      // PIÈGE VÉRIFIÉ (2026-07-16) : text-[var(--x)] est ambigu pour Tailwind
      // (couleur vs taille) — avec une var() il émet `color:`, la taille n'est
      // JAMAIS appliquée. Toujours utiliser le hint text-[length:var(--x)].
      expect(source, `${name} : text-[var(...)] ambigu — utiliser text-[length:var(...)]`).not.toMatch(
        /tw:text-\[var\(/,
      );
    }
  });

  it("aucun <button> nu hors ui/ et shadcn/ — Button, IconButton ou RowButton", () => {
    // le contrat bouton est TOTAL : toute surface activable passe par les
    // wrappers (action → Button/IconButton ; rangée/cellule/chip/trigger
    // cloné → RowButton, qui transmet ref et attributs natifs)
    const stripTsx = (code: string) =>
      code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (p.endsWith(join("components", "ui")) || p.endsWith(join("components", "shadcn"))) continue;
          walk(p);
        } else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) {
          if (stripTsx(readFileSync(p, "utf8")).includes("<button")) offenders.push(p);
        }
      }
    };
    walk(root);
    expect(offenders, `<button> nu dans : ${offenders.join(", ")}`).toEqual([]);
  });

  it("App.css : poids 400/500/600 et rayons uniquement via tokens", () => {
    // les @font-face déclarent les fontes disponibles (descripteurs), pas des
    // styles appliqués — seuls blocs autorisés à porter un 700
    const noFontFace = appCss.replace(/@font-face\s*\{[^}]*\}/g, "");
    for (const m of noFontFace.matchAll(/font-weight:\s*([^;]+);/g)) {
      const v = m[1].trim();
      if (v.includes("var(") || v === "inherit" || v === "normal") continue;
      expect(["400", "500", "600"], `font-weight hors système : ${v}`).toContain(v);
    }
    for (const m of noFontFace.matchAll(/font:\s*(\d{3})\s/g)) {
      expect(["400", "500", "600"], `font: shorthand hors système : ${m[1]}`).toContain(m[1]);
    }
    for (const m of appCss.matchAll(/border-radius:\s*([^;]+);/g)) {
      const v = m[1].trim();
      if (v.includes("var(") || v === "inherit" || v === "0" || v === "50%") continue;
      expect.fail(`border-radius hors tokens : ${v}`);
    }
  });

  // Stream saccadé (2026-08-25) : `text-wrap: pretty` sur .msg p redistribue
  // les fins de ligne de TOUT le paragraphe à chaque token — les mots déjà
  // affichés sautaient de gauche à droite pendant la frappe. La bulle en cours
  // de stream (rangée .is-live-stream, classe posée par React) repasse en wrap
  // simple ; pretty ne s'applique qu'au texte terminé, qui ne bouge plus.
  // Même campagne : un tableau GFM en cours de stream recalcule ses colonnes à
  // chaque token (largeur auto = contenu) — mesuré 248 px de dérive latérale
  // au banc, 0 px en table-layout fixed + width 100%. Le tableau TERMINÉ garde
  // son layout auto (largeur au contenu), recalculé une seule fois au done.
  it("un tableau en cours de stream a des colonnes stables", () => {
    expect(appCss).toMatch(/\.timeline-virtual-row\.is-live-stream \.chat-md table\s*\{[^}]*table-layout:\s*fixed[^}]*width:\s*100%/);
  });

  it("la bulle en cours de stream n'est jamais en text-wrap pretty", () => {
    expect(appCss).toMatch(/\.timeline-virtual-row\.is-live-stream \.msg p\s*\{[^}]*text-wrap:\s*wrap/);
  });

  it("les blocs LaTeX du chat portent la palette de l'éditeur LaTeX", () => {
    // commandes sur l'accent du thème actif (pas l'orange figé de la galerie),
    // accolades or et environnements turquoise via les classes posées par
    // decorateLatex (chat/md.tsx)
    expect(appCss).toMatch(/\.language-latex \.hljs-keyword\s*\{[^}]*color:\s*var\(--accent-text\)/);
    for (const cls of ["hljs-built_in", "hljs-tex-brace", "hljs-tex-env"]) {
      expect(appCss, cls).toMatch(new RegExp(`\\.language-latex \\.${cls}\\s*\\{[^}]*color:`));
    }
  });

  it("ouvre le diff dans la surface Git et garde les actions de commit compactes", () => {
    expect(appCss).not.toContain(".git-diff-sheet");
    expect(appCss).not.toContain(".git-mobile-diff-trigger");
    expect(appCss).toMatch(
      /\.git-commit-buttons\s*\{[^}]*width:\s*auto;[^}]*margin-left:\s*auto;/,
    );
    expect(appCss).toMatch(
      /\.git-commit-buttons\s+\.ui-btn\s*\{[^}]*flex:\s*none;/,
    );
  });

  // SURF-29 / CHAT-05 : les CSS de composants et de styles échappaient au gel
  // des hex d'App.css. Toute couleur y passe par un jeton ; seuls tokens.css
  // (palette source) et les blocs :root portent des hex.
  it("CSS de composants et de styles : aucun hex brut hors palette", () => {
    const files = [...componentCssFiles, ...collectFiles(join(root, "styles"), [".css"])]
      .filter((file) => !/[\\/]tokens\.css$/.test(file));
    const offenders: string[] = [];
    for (const file of files) {
      const body = stripComments(readFileSync(file, "utf8"))
        .replace(/:root[^{]*\{[^}]*\}/g, "")
        .replace(/var\(--[\w-]+,\s*#[0-9a-fA-F]{3,8}\)/g, "");
      for (const m of body.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) offenders.push(`${file.split(/[\\/]/).slice(-2).join("/")} → ${m[0]}`);
    }
    expect(offenders, offenders.slice(0, 20).join(" · ")).toEqual([]);
  });

  it("App.css : hex et z-index bruts gelés (sous-multisets — ne peuvent que rétrécir)", () => {
    // hors blocs :root (palette source de vérité), .hljs-* (palette syntaxique)
    // et fallbacks var(--x, #hex)
    const body = appCss
      .replace(/^:root[^{]*\{[^}]*\}/gm, "")
      .split("\n")
      .filter((l) => !l.includes("hljs"))
      .join("\n")
      .replace(/var\(--[\w-]+,\s*#[0-9a-fA-F]{3,8}\)/g, "");
    const count = (arr: string[]) =>
      arr.reduce<Record<string, number>>((acc, v) => ((acc[v] = (acc[v] ?? 0) + 1), acc), {});
    // #000 : ombres/masques ; #fff : knobs de switch/toggle + fonds d'iframe
    // web. Les couleurs d'état ont rejoint les blocs :root par thème.
    const hexAllow: Record<string, number> = { "#000": 3, "#fff": 6 };
    const hexActual = count([...body.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase()));
    for (const [v, n] of Object.entries(hexActual)) {
      expect(n, `hex ${v} : ${n} occurrence(s) > allowlist (${hexAllow[v] ?? 0})`).toBeLessThanOrEqual(hexAllow[v] ?? 0);
    }
    // z-index historiques (tokens.css : « migrent au fil des surfaces ») —
    // retirer une entrée quand une surface passe sur l'échelle --z-*
    const zAllow: Record<string, number> = {
      "2": 2, "30": 2, "40": 1, "45": 1, "50": 2, "55": 1, "70": 1, "80": 1,
      "90": 1, "95": 1, "160": 1, "260": 1, "285": 1,
    };
    const zActual = count(
      [...appCss.matchAll(/z-index:\s*([^;]+);/g)]
        .map((m) => m[1].trim())
        .filter((v) => !v.includes("var(") && !["0", "1", "-1", "auto"].includes(v)),
    );
    for (const [v, n] of Object.entries(zActual)) {
      expect(n, `z-index ${v} : ${n} occurrence(s) > allowlist (${zAllow[v] ?? 0})`).toBeLessThanOrEqual(zAllow[v] ?? 0);
    }
  });

  // tokens.css est l'INTERFACE PUBLIQUE du système : --text-*, --border-*,
  // --surface-*, --mark-*. Les noms historiques (--fg/--fg2/--muted/--muted2)
  // restent la SOURCE DE VÉRITÉ des valeurs — ils sont définis dans les deux
  // blocs :root d'App.css (dark et light) — mais plus personne ne les consomme
  // ailleurs. Sans ce garde-fou les deux vocabulaires recohabitent et le code
  // neuf ne sait plus lequel est canonique (baseline avant migration :
  // 638 déclarations historiques contre 53 sémantiques).
  it("App.css ne consomme les noms historiques que dans ses blocs :root (allowlist gelée)", () => {
    // on retire les blocs dont le SÉLECTEUR est purement :root (la palette) —
    // pas les règles descendantes du type `:root[data-theme="light"] .atelier`
    const body = appCss.replace(/^:root[^{\s]*(?:\s*,\s*:root[^{\s]*)*\s*\{[^}]*\}/gm, "");
    // --fg2 : cinq FONDS de marque en encre secondaire (pastilles d'agent
    // .dot.claude/.dot.codex, pouces de slider et d'effort, point de
    // prévisualisation pnav). C'est un troisième palier au-dessus de
    // --mark-neutral/--mark-neutral-strong ; le budget de tokens (tokens.css :
    // « ≥2 consommateurs réels ou une exigence sémantique ») a été alloué aux
    // deux paliers qui couvrent 20 déclarations. currentColor ne s'y applique
    // pas : ces éléments n'héritent pas de --fg2. Sous-multiset gelé — cette
    // liste ne peut que RÉTRÉCIR, jamais accueillir une nouvelle entrée.
    const legacyAllow: Record<string, number> = {
      "--fg": 0, "--fg2": 5, "--muted": 0, "--muted2": 0,
    };
    const actual: Record<string, number> = {};
    // `var(--fg)` comme `var(--fg, #hex)` : les deux formes consomment le nom
    for (const m of body.matchAll(/var\(\s*--(fg2|fg|muted2|muted)\s*[,)]/g)) {
      const name = `--${m[1]}`;
      actual[name] = (actual[name] ?? 0) + 1;
    }
    for (const [name, n] of Object.entries(actual)) {
      expect(
        n,
        `var(${name}) : ${n} occurrence(s) hors :root > allowlist (${legacyAllow[name] ?? 0}) — utiliser le token sémantique de tokens.css`,
      ).toBeLessThanOrEqual(legacyAllow[name] ?? 0);
    }
    // les alias doivent rester des alias : si une valeur brute atterrit ici, la
    // migration ci-dessus aurait changé le rendu sans que rien ne le signale
    for (const alias of [
      "--text-primary: var(--fg)", "--text-secondary: var(--fg2)",
      "--text-muted: var(--muted)", "--text-disabled: var(--muted2)",
      "--border-strong: var(--muted2)",
      "--mark-neutral: var(--muted2)", "--mark-neutral-strong: var(--muted)",
    ]) {
      expect(tokens, `alias rompu : ${alias}`).toContain(alias);
    }
  });

  it("frontière d'imports : boutons et infobulles passent par l'API produit", () => {
    // Les exceptions historiques ont été migrées. Les primitives composées
    // restent internes à ui/ et shadcn/; les écrans utilisent l'API produit.
    const offenders: string[] = [];
    const walk = (dir: string, rel: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        const r = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (p.endsWith(join("components", "ui")) || p.endsWith(join("components", "shadcn"))) continue;
          walk(p, r);
        } else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) {
          const src = readFileSync(p, "utf8");
          if (/from\s+"[^"]*shadcn\/(button|tooltip)"/.test(src)) offenders.push(r);
        }
      }
    };
    walk(root, "");
    expect(offenders, `import direct shadcn/button|tooltip hors API produit : ${offenders.join(", ")}`).toEqual([]);
  });

  it("aucun clash de nom entre le :root du pont shadcn et les palettes App.css/tokens.css", () => {
    // PIÈGE VÉRIFIÉ (2026-07-16) : App.css est chargé après shadcn.css — toute
    // custom property définie dans les deux écrase silencieusement le mapping
    // sémantique du pont (ex. --accent : orange brut au lieu du mix sélection).
    const rootProps = (css: string) => {
      const names = new Set<string>();
      for (const block of css.matchAll(/^:root[^{]*\{([^}]*)\}/gm)) {
        for (const decl of block[1].matchAll(/(--[\w-]+)\s*:/g)) names.add(decl[1]);
      }
      return names;
    };
    const bridge = rootProps(shadcn);
    for (const [name, other] of [["App.css", rootProps(appCss)], ["tokens.css", rootProps(tokens)]] as const) {
      const clash = [...bridge].filter((p) => other.has(p));
      expect(clash, `custom properties définies à la fois dans shadcn.css et ${name} : ${clash.join(", ")}`).toEqual([]);
    }
  });

  it("le pont snappe les échelles Tailwind sur le système (rayons 6/10, texte 12/13)", () => {
    expect(shadcn).toContain("--radius-sm: var(--radius-control)");
    expect(shadcn).toContain("--radius-md: var(--radius-control)");
    expect(shadcn).toContain("--radius-lg: var(--radius-surface)");
    expect(shadcn).toContain("--radius-xl: var(--radius-surface)");
    expect(shadcn).toContain("--text-xs: var(--fs-body-s)");
    expect(shadcn).toContain("--text-sm: var(--fs-body)");
  });

  // Un <h2>/<p> sans taille ni marge explicites retombe sur la feuille du
  // navigateur : 18px et des marges de .83em, à l'intérieur d'un panneau de
  // 300px. Le titre du panneau modèle Quick Ask a vécu ça jusqu'au
  // 2026-08-31 ; deux popovers s'étaient déjà rattrapés à la main.
  it("les titres de surface ne retombent jamais sur l'échelle du navigateur", () => {
    const popover = shadcnSources.find(([name]) => name === "popover.tsx")![1];
    const title = popover.match(/data-slot="popover-title"[\s\S]*?className\)/)![0];
    expect(title).toContain("tw:m-0");
    // Titre 13 semi-gras au-dessus d'un corps à 12 (lot 3, PRIM-16).
    expect(title).toContain("tw:text-[length:var(--fs-body)]");
    expect(title).toContain("tw:font-semibold");
    const desc = popover.match(/data-slot="popover-description"[\s\S]*?className\)/)![0];
    expect(desc).toContain("tw:m-0");
  });

  // Le cadre du composeur Quick Ask est porté par .qa-composer ; le champ n'a
  // pas d'état de focus à lui. En variante `default`, shadcn pose un `ring-1`
  // qui se superposait à ce cadre — angles droits contre rayon 10, parce que
  // .qa-input force un rayon nul. Deux contours désaccordés au clic.
  it("le champ du composeur Quick Ask ne porte pas son propre focus", () => {
    const qa = readFileSync(join(root, "components", "QuickAsk.tsx"), "utf8");
    const textarea = qa.match(/<Textarea[\s\S]*?className="qa-input"/)![0];
    expect(textarea).toContain('variant="bare"');
  });

  // La rangée de menu doit décrire le balisage réel du SelectItem : deux
  // enfants dont la coche en absolu. Une grille à colonnes fixes n'a plus
  // qu'un enfant à placer et l'enferme dans 14px — l'icône passait à la ligne
  // au-dessus de son libellé (capture Thierry 2026-08-31).
  it("les rangées de select ne repartent pas en grille à colonnes fixes", () => {
    const rule = appCss.match(/\.custom-select-option \{[^}]*\}/)![0];
    expect(rule).toContain("display: flex");
    expect(rule).not.toContain("grid-template-columns");
    expect(appCss).not.toContain(".custom-select-option.has-icon");
    // le ✓ et le chevron de lucide sortent en 24px s'ils ne sont pas bornés
    expect(appCss).toContain('.custom-select-option [data-icon="select-check"]');
  });

  // Une classe déclarée deux fois dans App.css se corrige au mauvais endroit
  // une fois sur deux — les récents du Quick Ask ont vécu ça.
  it("les blocs du Quick Ask ne sont déclarés qu'une fois", () => {
    for (const sel of [".qa-recents", ".qa-recents-btn", ".qa-recent-row", ".qa-recent-q"]) {
      const hits = appCss.split("\n").filter((line) => line.trimStart().startsWith(sel + " {"));
      expect(hits.length, `${sel} déclaré ${hits.length} fois`).toBe(1);
    }
  });

  it("la couche shadcn ne contient que des primitives de registre", () => {
    expect(readdirSync(shadcnDir)).not.toContain("dialog-surface.tsx");
    expect(readdirSync(shadcnDir)).not.toContain("dropdown-menu-surface.tsx");
    for (const primitive of ["field.tsx", "radio-group.tsx", "sidebar.tsx"]) {
      expect(readdirSync(shadcnDir)).toContain(primitive);
    }
  });

  it("l'inventaire final ne contient aucune primitive installée au cas où", () => {
    expect(shadcnSources.map(([name]) => name).sort()).toEqual([
      "alert-dialog.tsx", "alert.tsx", "attachment.tsx", "badge.tsx",
      "bubble.tsx", "button-group.tsx", "button.tsx", "checkbox.tsx",
      "collapsible.tsx", "command.tsx", "context-menu.tsx", "dialog.tsx",
      "dropdown-menu.tsx", "empty.tsx", "field.tsx", "input-group.tsx",
      "input.tsx", "kbd.tsx",
      "message.tsx", "popover.tsx", "progress.tsx", "radio-group.tsx",
      "scroll-area.tsx", "select.tsx", "separator.tsx", "sheet.tsx", "sidebar.tsx",
      "skeleton.tsx", "slider.tsx", "sonner.tsx", "spinner.tsx",
      "switch.tsx", "table.tsx", "tabs.tsx", "textarea.tsx", "toggle-group.tsx",
      "toggle.tsx", "tooltip.tsx",
    ]);
  });

  it("les primitives bouton sans Preflight neutralisent le chrome WebKit natif", () => {
    const sources = Object.fromEntries(shadcnSources);
    expect(sources["tabs.tsx"]).toContain("tw:appearance-none");
    expect(sources["tabs.tsx"]).toContain("tw:border-0 tw:bg-transparent tw:p-0");
    expect(sources["button.tsx"]).toMatch(/ghost:\s*\n?\s*"[^"]*tw:bg-transparent/);
    expect(sources["button.tsx"]).toMatch(/link:\s*"[^"]*tw:bg-transparent/);
  });

  it("le chrome Galerie délègue le stacking aux primitives partagées", () => {
    expect(galleryMain).not.toContain('type="search"');
    expect(galleryMain).not.toMatch(/tw:z-(?:\d+|\[[^v][^\]]*\])/);
    expect(galleryMain).toContain('components/ui/Tooltip');
    expect(galleryMain).toContain('layer={modal ? "modal" : "panel"}');
    expect(galleryStyles).toContain('@source "./main.tsx"');
    expect(galleryStyles).not.toContain('@source "./**/*.{ts,tsx}"');
  });

  it("budget d'animation : primitives.css définit exactement une @keyframes (spinner)", () => {
    const keyframes = primitives.match(/@keyframes\s+([\w-]+)/g) ?? [];
    expect(keyframes).toEqual(["@keyframes ui-spin"]);
  });

  // §9, AMENDÉ le 2026-08-26 (décision Thierry, « option B ») : le fil porte
  // au plus DEUX boucles continues, et exactement celles listées ici.
  //
  //   .working-label::before   pulse 1,2 s — le TOUR tourne (chrono)
  //   .ui-activity-label.is-shimmering .tool-ticker-row (ou le libellé
  //   lui-même s'il n'a pas de ticker)
  //                            balayage 2 s — l'ACTION en cours
  //
  // Le balayage vit sur la RANGÉE du ticker, pas sur le libellé : le reel
  // porte un `transform`, et un `background-clip: text` posé sur le parent
  // rendrait le texte entièrement invisible (vécu au banc, cf. App.css).
  //
  // La règle d'origine (une seule) venait de sept boucles non harmoniques
  // (1,4 s / 2 s / 4 s) qui battaient les unes contre les autres : ce qui la
  // rendait nécessaire, c'était leur NOMBRE et leur désaccord, pas le principe
  // d'unicité. Les deux retenues portent des sens distincts et n'occupent pas
  // la même ligne — le chrono ferme le bloc, le balayage vit dans la ligne
  // d'activité. Un seul libellé balaie à la fois : ActivityGroup ne passe
  // `shimmer` qu'au groupe LIVE du tour.
  //
  // Tout le RESTE continue de se différencier par la COULEUR et le TEXTE
  // (--status-running, libellé), jamais par le mouvement — la liste interdite
  // ci-dessous reste fermée, et le total reste plafonné à deux. Hors
  // périmètre : le spinner de la barre Reviewer (.rb-spin), bannière au-dessus
  // du fil, jamais co-visible — une revue ne démarre que sur un tour terminé.
  it("chat : seules les animations explicites de statut et de repli sont autorisées", () => {
    const rules = [...appCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selector: m[1].trim().replace(/\s+/g, " "),
      body: m[2],
    }));
    // .stream-caret est sorti de cette liste : il porte une animation ONE-SHOT
    // re-déclenchée par chaque lot de texte reçu (key React) — pilotée par les
    // événements, pas par une horloge. §9 vise les boucles : le garde-fou
    // `infinite` ci-dessous continue de couvrir le caret comme tout le fil.
    for (const selector of [
      ".thinking.live .thinking-label",
      ".thinking.live .thinking-icon",
      ".activity-step.running .activity-step-dot",
      ".review-badge.v-running",
    ]) {
      const animated = rules.filter(
        (r) => r.selector.includes(selector)
          && /animation[a-z-]*:/.test(r.body)
          && !/animation:\s*none/.test(r.body),
      );
      expect(animated.map((r) => r.selector), `${selector} porte encore une animation`).toEqual([]);
    }
    const chatScope = /\b(msg|thinking|activity|working|stream-caret|turn|review-badge|capsule|queued)\b/;
    const loops = rules
      .filter((r) => /animation[^;]*infinite/.test(r.body))
      .map((r) => r.selector)
      .filter((selector) => chatScope.test(selector));
    // A11 (CHAT-04 / TRANS-07) : une boucle visible par tour. L'étoile de la
    // ligne vivante, le carré du chrono et le glyphe d'un sous-agent sont
    // FIXES ; restent le reflet de la ligne vivante (figé dès qu'un anneau
    // d'action tourne), le reflet d'une rangée et l'anneau d'action.
    expect(loops.sort()).toEqual([
      ".turn-working-shimmer",
      ".ui-activity-label.is-shimmering .tool-ticker-row, .ui-activity-label.is-shimmering:not(:has(.tool-ticker))",
      // anneau d'une action en cours (colonne d'état de la rangée, refonte du
      // 2026-10-18) — il REMPLACE le balayage de la ligne vivante, qui ne
      // tourne plus : une seule boucle par rangée, coupée sous reduced-motion
      ".ui-activity-state .tool-run-ring, .tool-status .tool-run-ring",
    ]);
    expect(appCss).toMatch(/\.messages:has\(\.ui-activity-state \.tool-run-ring, \.tool-status \.tool-run-ring\) \.turn-working-shimmer/);
  });

  // Deux régressions VÉCUES au banc le 2026-08-26, invisibles en jsdom (rien
  // n'y est peint) et invisibles en relecture : le balayage se voit ou ne se
  // voit pas, à l'œil, dans l'app. Ce test tient les deux bornes.
  it("balayage : le clip reste sur la rangée, la bande reste dans l'élément", () => {
    // 1. Le libellé PARENT ne doit jamais porter le clip : le reel du ticker
    //    est transformé, et le clip du parent rend alors le texte INVISIBLE.
    const parent = appCss.match(
      /\.ui-activity-label\.is-shimmering\s*\{([^}]*)\}/,
    );
    expect(parent, "règle .ui-activity-label.is-shimmering introuvable").toBeTruthy();
    expect(parent![1]).not.toMatch(/background-clip:\s*text/);

    // 2. Le texte doit TOUJOURS être couvert par l'image de fond : sous
    //    `background-clip: text`, la moindre zone non couverte rend le libellé
    //    TRANSPARENT, donc invisible. Deux façons de le garantir — l'ancienne
    //    bornait la position dans [0%, 100%], l'actuelle fait carreler l'image
    //    (`repeat-x`), ce qui la rend inépuisable. Au moins une doit tenir.
    const regle = appCss.match(
      /\.ui-activity-label\.is-shimmering \.tool-ticker-row,[\s\S]*?\{([\s\S]*?)\}/,
    );
    expect(regle, "règle de balayage introuvable").toBeTruthy();
    expect(regle![1]).toMatch(/background-repeat:\s*repeat-x/);
    //    Filet de sécurité repris de l'app ChatGPT : une couleur PLEINE sous le
    //    dégradé. Même si l'image venait à ne pas couvrir, le texte garde une
    //    peinture au lieu de devenir invisible.
    expect(regle![1], "fond plein manquant sous le dégradé").toMatch(/background-color:\s*var\(--text-muted\)/);

    // 3. Le déplacement vaut EXACTEMENT une tuile. Sinon la boucle saute à
    //    chaque tour, et la vitesse cesse d'être celle qu'on croit.
    const tuile = regle![1].match(/background-size:\s*([\d.]+)ch/);
    expect(tuile, "background-size doit être en ch (vitesse indépendante de la longueur)").toBeTruthy();
    const sweep = appCss.match(/@keyframes\s+label-sweep\s*\{([\s\S]*?)\n\}/);
    expect(sweep, "@keyframes label-sweep introuvable").toBeTruthy();
    const bornes = [...sweep![1].matchAll(/background-position:\s*([\d.]+)ch/g)].map((m) => Number(m[1]));
    expect(bornes.length, "les bornes doivent être en ch, pas en %").toBe(2);
    expect(Math.abs(bornes[0] - bornes[1])).toBe(Number(tuile![1]));
  });

  // Débordement du fil actif : FONDU de bord (masque), jamais « … » — une
  // ellipsis dessinée dans la zone fanée ferait double troncature. Seul le
  // parent porte le masque, jamais le texte court à l'intérieur du ticker.
  it("fil actif : débordement en fondu de bord, sans ellipsis", () => {
    for (const [source, sel] of [
      [primitives, ".ui-activity-label"],
      [appCss, ".tool-ticker-row"],
    ] as const) {
      // ancrée en début de ligne : sinon elle matche d'abord la variante
      // `.is-summary .ui-activity-label`, qui retire volontairement le masque
      const corps = source.match(new RegExp(`(?:^|\\n)\\${sel} \\{([^}]*)\\}`))?.[1] ?? "";
      expect(corps, `règle ${sel} introuvable`).not.toBe("");
      if (sel === ".ui-activity-label") {
        expect(corps, `${sel} : masque de fondu absent`).toMatch(/mask-image:\s*linear-gradient\(90deg/);
      } else {
        expect(corps, "un masque sur le ticker efface la fin des libellés courts").not.toMatch(/mask-image:/);
        expect(corps).toMatch(/display:\s*block/);
      }
      expect(corps, `${sel} : ellipsis en double du fondu`).not.toMatch(/text-overflow:\s*ellipsis/);
    }
    // et l'exception : un trigger résumé se rétrécit à son contenu, rien n'y
    // déborde — le masque y fanerait la fin de chaque libellé court
    expect(primitives).toMatch(/\.is-summary \.ui-activity-label \{[^}]*mask-image:\s*none/);
  });

  // Le fondu par mots tournait à 220 ms « ease-out » écrit en dur à DEUX
  // endroits (réponse et pensée) : ils pouvaient diverger sans que rien ne le
  // dise, et 220 ms dépassait le plafond que --motion-panel déclare absolu.
  it("fondu par mots : durée et courbe par token, jamais en dur", () => {
    const regles = [...appCss.matchAll(/\.sw \{([^}]*animation:[^}]*)\}/g)].map((m) => m[1]);
    expect(regles.length, "aucune règle de fondu par mots trouvée").toBeGreaterThanOrEqual(2);
    for (const corps of regles) {
      if (/animation:\s*none/.test(corps)) continue;
      expect(corps, `durée en dur dans « ${corps.trim()} »`).not.toMatch(/\d+ms/);
      expect(corps).toContain("var(--motion-panel)");
      expect(corps).toContain("var(--ease-stream)");
    }
    expect(tokens).toContain("--ease-stream:");
  });

  // §7 : « Densité : compact 3 / comfortable 6 / spacious 10 px sur --pad-y ».
  // Le token n'avait que trois consommateurs (.sidebar li, un `.sidebar button`
  // trop large, .set-row) : le réglage était quasi placebo. Il pilote désormais
  // toutes les familles de rangées denses.
  it("le réglage Densité pilote les vraies listes denses (--pad-y)", () => {
    for (const [name, rule] of [
      [".sidebar li", /\.sidebar li\s*\{[^}]*padding:[^;]*var\(--pad-y/],
      [".sidebar button (reset ciblé)", /\.sidebar button:not\(\[class\*="ui-"\]\)[^{]*\{[^}]*padding:\s*var\(--pad-y/],
      [".exp-row", /\.exp-row\s*\{[^}]*padding:[^;]*var\(--pad-y/],
      [".set-nav-item", /\.set-nav-item\s*\{[^}]*padding:[^;]*var\(--pad-y/],
      [".git-file-row", /\.git-file-row\s*\{[^}]*padding:[^;]*var\(--pad-y/],
      [".biblio-main-button", /\.biblio-main-button\s*\{[^}]*padding:[^;]*var\(--pad-y/],
      [".ledger-row", /\.ledger-row\s*\{[^}]*padding:[^;]*var\(--pad-y/],
      [".set-row", /\.set-row\s*\{[^}]*padding:[^;]*var\(--pad-y/],
    ] as const) {
      expect(appCss, `${name} ne consomme pas --pad-y`).toMatch(rule);
    }
    // le sélecteur trop large (0,1,1) écrasait .pnav-row-main et les ui/ : parti
    expect(appCss).not.toMatch(/\.sidebar button\s*\{\s*padding:/);
    // garde-fou de cible : la densité compacte ne fait pas passer une rangée de
    // navigation sous --control-height
    expect(appCss).toMatch(/\.set-nav-item\s*\{[^}]*min-height:\s*var\(--control-height\)/);
    // --pad-y reste la SEULE dimension pilotée par la densité
    const density = [...appCss.matchAll(/:root\[data-density="[a-z]+"\]\s*\{([^}]*)\}/g)]
      .flatMap((m) => [...m[1].matchAll(/(--[\w-]+)\s*:/g)].map((d) => d[1]));
    expect([...new Set(density)]).toEqual(["--pad-y"]);
  });

  it("reduced motion : les tokens de durée sont neutralisés centralement (0ms)", () => {
    const block = tokens.match(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\n\}/);
    expect(block).not.toBeNull();
    for (const v of ["--motion-fast: 0ms", "--motion-standard: 0ms", "--motion-panel: 0ms"]) {
      expect(block![0]).toContain(v);
    }
  });

  it("primitives.css : aucune durée en ms hors tokens ; plafond 150 ms par construction", () => {
    // toute durée doit passer par var(--motion-*) / var(--tooltip-delay)
    const rawMs = primitives.match(/\b\d+(\.\d+)?ms\b/g) ?? [];
    expect(rawMs, `durées ms en dur dans primitives.css : ${rawMs.join(", ")}`).toEqual([]);
    // aucune durée en secondes non plus : la rotation du spinner passe par
    // le jeton unique --motion-spin (A11)
    const rawS = primitives.match(/\b\d+(\.\d+)?s\b/g) ?? [];
    expect(rawS).toEqual([]);
    expect(primitives).toMatch(/\.ui-spin\s*\{[^}]*animation:\s*ui-spin var\(--motion-spin\) linear infinite/);
  });

  it("tokens : les durées déclarées respectent le plafond 120/140/150 et le délai tooltip 400–450", () => {
    expect(tokens).toContain("--motion-fast: 120ms");
    expect(tokens).toContain("--motion-standard: 140ms");
    expect(tokens).toContain("--motion-panel: 150ms");
    const delay = Number(tokens.match(/--tooltip-delay: (\d+)ms/)?.[1]);
    expect(delay).toBeGreaterThanOrEqual(400);
    expect(delay).toBeLessThanOrEqual(450);
  });

  it("primitives.css : z-index uniquement via l'échelle --z-*", () => {
    const zLines = primitives.match(/z-index:[^;]+;/g) ?? [];
    for (const line of zLines) {
      expect(line, `z-index en dur : ${line}`).toMatch(/z-index:\s*var\(--z-[a-z]+\);/);
    }
  });

  it("primitives.css : aucune transition de géométrie (width/height/padding/margin)", () => {
    const transitions = primitives.match(/transition:[^;]+;/g) ?? [];
    for (const line of transitions) {
      expect(line).not.toMatch(/\b(width|height|padding|margin|top|left|right|bottom)\b/);
    }
  });

  it("Chat et Gallery partagent le même token de hauteur de header", () => {
    expect(tokens).toContain("--surface-header-height: 44px");
    expect(primitives).toMatch(/\.ui-surface-header\s*\{[\s\S]*?min-height:\s*var\(--surface-header-height\)/);
    expect(appCss).toMatch(/\.atelier-bar\s*\{[\s\S]*?height:\s*var\(--surface-header-height\)/);
    expect(appCss).toMatch(/\.atelier-bar\s*\{[\s\S]*?flex-direction:\s*row/);
  });

  it("les contrôles partagent une géométrie et une bordure interactive communes", () => {
    // A5 (PRIM-06) : une échelle de trois hauteurs 24 / 28 / 32, arrondies à la
    // grille de 4 quelle que soit la taille d'interface ; les anciens noms
    // (--control-height, -compact, -mini) n'en sont que des alias
    for (const [k, f] of [["s", "1\\.6"], ["m", "1\\.8666"], ["l", "2\\.1333"]]) {
      expect(tokens).toMatch(new RegExp(`--control-height-${k}: round\\(nearest, calc\\(var\\(--ui-base-size, 15px\\) \\* ${f}\\d*\\), 4px\\)`));
    }
    expect(tokens).toContain("--control-height: var(--control-height-m)");
    expect(tokens).toContain("--control-height-compact: var(--control-height-s)");
    expect(tokens).toContain("--border-interactive:");
    expect(shadcn).toContain("--color-background: var(--background)");
    expect(shadcn).toContain("--color-ring: var(--ring)");
    expect(shadcnButton).toContain("tw:rounded-[var(--radius-control)]");
    expect(shadcnButton).toContain("tw:duration-[var(--motion-fast)]");
    expect(shadcnButton).toContain('ghost:\n          "tw:bg-transparent');
    expect(shadcnSources.find(([name]) => name === "field.tsx")?.[1]).toContain("tw:border-0 tw:p-0");
    expect(shadcnDialog).toContain("<DialogViewport>");
    expect(shadcnDialog).toContain("tw:flex tw:items-center tw:justify-center");
    // bornées à UN bloc ([^}]*) et ancrées en début de ligne : l'ancienne
    // forme [\s\S]*? traversait des centaines de règles et passait à vide
    // (audit PRIM-26 : la vraie règle disait min-height: 26px)
    expect(appCss).toMatch(/^\.custom-select-trigger\s*\{[^}]*min-height:\s*var\(--control-height\)/m);
    expect(appCss).toMatch(/^\.exp-search\s*\{[^}]*min-height:\s*var\(--control-height\)/m);
  });

  it("le mode de permission a UN signe, porté par l'option (déclencheur + menu)", () => {
    // le signe du déclencheur ne s'apprend que si le menu le montre aussi :
    // le ::before réservé au déclencheur est mort, .perm-icon le remplace
    expect(appCss).not.toMatch(/\.custom-select-label::before/);
    // monochrome : un état permanent ne porte pas une couleur d'alerte
    expect(appCss).toMatch(/\.perm-icon\s*\{[^}]*color:\s*var\(--text-muted\)/);
    expect(appCss).not.toMatch(/\.perm-icon[^{]*\{[^}]*var\(--u-warn\)/);
    // le menu se lit à l'échelle de la barre dont il sort, pas à celle du fil
    expect(appCss).toMatch(/\.permission-select \.custom-select-option[\s\S]{0,140}font-size:\s*var\(--fs-m\)/);
    // déclencheur sans libellé : plus de typo à régler, une icône et un chevron
    expect(appCss).toMatch(/\.permission-select \.custom-select-trigger-icon\s*\{[^}]*color:\s*var\(--text-secondary\)/);
  });

  it("la barre du composer désigne qui cède quand la place manque", () => {
    // Vécu 2026-09-01 : avec la pilule « Rigueur scientifique », la barre
    // débordait et le bouton d'ENVOI sortait de la boîte. Cause : personne
    // n'avait le droit de rétrécir, donc l'ordre du DOM choisissait la
    // victime. Le nom du modèle est l'élastique désigné ; l'envoi ne cède
    // jamais. Sans `min-width: 0` sur les deux maillons, l'ellipse déjà
    // portée par `.mp-name` reste inopérante.
    expect(appCss).toMatch(/\.composer-bar \.send\s*\{[^}]*flex:\s*none/);
    expect(appCss).toMatch(/\.model-pick\s*\{[^}]*min-width:\s*0/);
    expect(appCss).toMatch(/\.composer-bar \.mp-btn\.mp-model\s*\{[^}]*min-width:\s*0/);
    expect(appCss).toMatch(/\.mp-model \.mp-name\s*\{[^}]*text-overflow:\s*ellipsis/);
    // Les paliers de repli suivent le CONTENEUR (.chat-primary), pas la
    // fenêtre : un panneau latéral ouvert rend le composeur étroit dans une
    // fenêtre large, et une media query ne le voyait pas.
    for (const largeur of [520, 430, 360]) {
      expect(appCss).toMatch(new RegExp(`@container \\(max-width: ${largeur}px\\)`));
    }
    expect(appCss).not.toMatch(/@media \(max-width: 720px\)[^}]*\{[^}]*consigne-pilule-nom/);
  });

  it("le composer aligne ses contrôles et distingue l'action ronde", () => {
    expect(appCss).toMatch(/\.composer-bar\s*\{[^}]*--composer-ctl-h:\s*30px/);
    for (const sel of [
      "\\.composer-bar \\.ghost",
      "\\.composer-bar \\.permission-select\\.compact \\.custom-select-trigger",
      "\\.composer-bar \\.mp-btn\\.mp-model",
    ]) {
      expect(appCss).toMatch(new RegExp(`${sel}[^{]*\\{[^}]*var\\(--composer-ctl-h\\)`));
    }
    expect(appCss).toMatch(/\.composer-bar\s*\{[^}]*gap:\s*2px/);
    expect(appCss).toMatch(/\.composer-bar \.send\s*\{[^}]*border-radius:\s*50%/);
    expect(appCss).toMatch(/\.composer-input-group\s*\{[^}]*border-radius:\s*var\(--radius-composer\)/);
  });

  // Le cadre du composeur Quick Ask est porté par .qa-composer (marges
  // comprises) depuis que la citation vit DEDANS : le champ n'a plus ni
  // bordure ni marge propre, sinon on retrouve deux objets empilés.
  it("Quick Ask réserve les marges du composeur dans sa largeur", () => {
    expect(appCss).toMatch(/\.qa-composer\s*\{[^}]*margin:\s*0 16px 12px/);
    expect(appCss).toMatch(/\.qa-composer\s*\{[^}]*box-sizing:\s*border-box/);
    expect(appCss).toMatch(/\.qa-input\s*\{[^}]*width:\s*100%/);
    expect(appCss).toMatch(/\.qa-input\s*\{[^}]*border:\s*none/);
    expect(appCss).toMatch(/\.qa-input\s*\{[^}]*margin:\s*0/);
    // une seule bordure, et c'est elle qui répond au focus
    expect(appCss).toMatch(/\.qa-composer:focus-within\s*\{[^}]*border-color/);
    expect(appCss).toMatch(/\.qa-ctx\s*\{[^}]*border:\s*none/);
    expect(appCss).toMatch(/\.qa-ctx\s*\{[^}]*margin:\s*0;/);
  });

  it("le textarea du composer peut réellement grandir sans être comprimé par flex", () => {
    expect(appCss).toMatch(/\.ta-wrap textarea\s*\{[^}]*flex:\s*none;/s);
  });

  it("modifier un message conserve exactement sa typographie de bulle", () => {
    expect(appCss).toMatch(/\.user-bubble\s*\{[^}]*font-size:\s*var\(--chat-fs, var\(--fs-xl\)\)/s);
    expect(appCss).toMatch(/\.user-bubble\s*\{[^}]*line-height:\s*var\(--chat-lh, 1\.7\)/s);
    expect(appCss).toMatch(/\.edit-message-textarea\s*\{[^}]*font-size:\s*var\(--chat-fs, var\(--fs-xl\)\)/s);
    expect(appCss).toMatch(/\.edit-message-textarea\s*\{[^}]*font-weight:\s*inherit/s);
    expect(appCss).toMatch(/\.edit-message-textarea\s*\{[^}]*letter-spacing:\s*inherit/s);
    expect(appCss).toMatch(/\.edit-message-textarea\s*\{[^}]*line-height:\s*var\(--chat-lh, 1\.7\)/s);
  });

  // GAP-18 : la croix du plein écran suit le bouton-icône standard — transparente
  // au repos, --bg-ctl au survol, anneau de focus visible au clavier.
  it("le bouton de fermeture Mermaid suit le bouton-icône standard", () => {
    expect(appCss).toMatch(/\.mermaid-fullscreen-close\s*\{[^}]*background:\s*transparent/s);
    expect(appCss).toMatch(/\.mermaid-fullscreen-close:hover\s*\{[^}]*background:\s*var\(--bg-ctl\)/s);
    expect(appCss).toMatch(/\.mermaid-fullscreen-close:focus-visible\s*\{[^}]*outline:\s*var\(--focus-ring-width\)/s);
  });

  it("les tabs Atelier restent compacts et neutres, sans accent de marque", () => {
    // la rangée active porte le repère COMMUN des listes (A13) — jamais une
    // seconde marque propre au navigateur (audit SHELL-02)
    expect(appCss).not.toMatch(/(^|\n)\.pnav-row\.active::before/);
    expect(appCss).not.toMatch(/\.sidebar li(\.pnav-row)?\.active::before/);
    expect(primitives).toMatch(/\.ui-tab\s*\{[^}]*height:\s*var\(--control-height-m\)/);
    // sélection = fond seul (A5/A13) : plus de soulignement en second signal,
    // et le survol d'un onglet inactif reste plus léger que l'actif
    expect(primitives).not.toMatch(/\.ui-tab[^{]*::after/);
    expect(primitives).toMatch(/\.ui-tab:is\(\[data-active\], \.is-active\)\s*\{[^}]*background:\s*var\(--surface-inset\)/);
    expect(primitives).toMatch(/\.ui-tab:hover:not\(\[data-active\]\):not\(\.is-active\)\s*\{[^}]*background:\s*var\(--surface-hover\)/);
    expect(primitives).not.toMatch(/\.ui-tab\.is-active[^}]*var\(--selection-line\)/);
  });

  it("la consigne active se lit au remplissage, jamais à l'accent de marque", () => {
    const bloc = appCss.match(/^\.consigne-pilule \{[^}]*\}/m)?.[0] ?? "";
    expect(bloc).toContain("var(--bg-ctl)");
    expect(bloc).not.toContain("--accent");
    expect(bloc).toContain("max-width: 132px");
  });

  it("les patterns officiels n'ont plus de seconde implémentation dans App.css", () => {
    for (const legacy of [".atab {", ".jump-pill {", ".tool-group.worklog", ".turn-fold {"]) {
      expect(appCss.includes(legacy), `ancienne implémentation encore présente: ${legacy}`).toBe(false);
    }
    for (const primitive of [".ui-tab {", ".ui-activity {", ".ui-scroll-to-bottom {"]) {
      expect(primitives.includes(primitive), `primitive absente: ${primitive}`).toBe(true);
    }
  });

  it("les surfaces interactives partagent les durées Quiet Instrument", () => {
    expect(appCss).toMatch(/\.exp-row, \.pnav-row, \.set-nav-item,[\s\S]*?background-color var\(--motion-fast\) var\(--ease-out\)/);
    expect(appCss).toMatch(/box-shadow var\(--motion-standard\) var\(--ease-out\)/);
    // la croix d'onglet : cachée au repos, révélée au survol / focus / actif,
    // dans les durées communes ; fermer n'est pas détruire (jamais rouge)
    expect(primitives).toMatch(/\.ui-tab-close\s*\{[^}]*opacity:\s*0;[^}]*transition:\s*opacity var\(--motion-fast\)/);
    expect(primitives).toMatch(/\.ui-tab:hover \.ui-tab-close,[^{]*\{\s*opacity:\s*1/);
    expect(primitives).not.toMatch(/\.ui-tab-close:hover\s*\{[^}]*--status-error/);
  });

  it("les iframes Atelier ne révèlent jamais un fond blanc dans leur gouttière", () => {
    expect(appCss).toMatch(/\.atelier\s*\{[\s\S]*?background:\s*var\(--surface-app\);[\s\S]*?color-scheme:\s*dark/);
    expect(appCss).toMatch(/:root\[data-theme="light"\] \.atelier\s*\{\s*color-scheme:\s*light/);
    expect(appCss).not.toMatch(/\.atelier\s*\{[^}]*background:\s*#fff/);
  });

  it("toutes les cartes partagent un seul fond, la gouttière seule divise", () => {
    // Décision 2026-08-16 (retour Thierry « trop carré ») : panneaux et headers
    // prennent un ton entre le canvas et --bg-side pour que les zones existent
    // sans traits. La nuance DOIT rester dérivée des deux fonds du thème.
    // Une SEULE couleur de carte : le chrome ne se teinte pas à part, sinon
    // les bandes qui en résultent se relisent comme les traits qu'on enlève.
    expect(tokens).toContain("--surface-panel: var(--surface-app)");
    expect(tokens).toContain("--surface-header: var(--surface-panel)");
    // le sol des gouttières doit rester un ton propre, jamais --bg réutilisé :
    // sans écart de luminance, les cartes ne décollent plus (option 3)
    expect(tokens).toContain("--surface-canvas: var(--canvas)");
    expect(appCss).toMatch(/\.sidebar\s*\{[\s\S]*?background:\s*var\(--surface-panel\)/);
    expect(appCss).toMatch(/\.rail\s*\{[\s\S]*?background:\s*var\(--surface-panel\)/);
    expect(appCss).toMatch(/\.topbar\s*\{[\s\S]*?background:\s*var\(--surface-header\)/);
    for (const selector of ["side-fixed", "explorer", "set-nav", "biblio-left", "generateur-form", "pnav-header"]) {
      expect(appCss, `${selector} doit utiliser --surface-panel`).toMatch(
        new RegExp(`\\.${selector}\\s*\\{[\\s\\S]*?background:\\s*var\\(--surface-panel\\)`),
      );
    }
    for (const selector of ["surface-bar", "term-bar", "browser-chrome", "browser-bar", "git-head", "git-commit", "biblio-reader-head", "reviewer-bar"]) {
      expect(appCss, `${selector} doit utiliser --surface-header`).toMatch(
        new RegExp(`\\.${selector}\\s*\\{[\\s\\S]*?background:\\s*var\\(--surface-header\\)`),
      );
    }
  });

  it("les séparateurs gardent leur cible de pointage et ne montrent qu'une pastille", () => {
    // Décision 2026-08-16 : plus AUCUN filet bord à bord — au repos c'est la
    // gouttière (le sol) qui divise, et le repère de saisie n'apparaît qu'au
    // survol, arrondi et en retrait. Le trait 1px permanent était exactement
    // le « trop carré » signalé par Thierry.
    expect(tokens).toContain("--resize-handle-hit: 4px");
    expect(appCss).toMatch(/\.handle\s*\{[\s\S]*?width:\s*var\(--resize-handle-hit\)/);
    for (const selector of ["\\.handle", "\\.pane-divider", "\\.workspace-divider"]) {
      // bloc borné à `}` : sans borne, la regex traversait la règle suivante
      // et pouvait se satisfaire d'une déclaration qui ne lui appartient pas
      const block = new RegExp(`${selector}::after\\s*\\{([^}]*)\\}`);
      const found = appCss.match(block);
      expect(found, `${selector}::after doit exister`).toBeTruthy();
      expect(found![1], `${selector}::after : pastille arrondie`).toMatch(/border-radius:\s*var\(--r-pill\)/);
      expect(found![1], `${selector}::after : invisible au repos`).toMatch(/opacity:\s*0\s*;/);
    }
    // …et redevenir visible à la prise en main, sinon la poignée est morte
    expect(appCss).toMatch(/\.handle:hover::after[\s\S]{0,200}opacity:\s*1/);
    expect(appCss).toMatch(/\.app-row\.dragging \.side-handle::after\s*\{\s*opacity:\s*1/);
  });

  it("le sol des gouttières est réellement peint, et dérivé du thème actif", () => {
    // Régression vécue le 2026-08-16 : une règle .app-row/.main-card PLUS BAS
    // dans le fichier repeignait var(--bg) à spécificité égale — le sol de
    // l'option 3 n'existait tout simplement pas au niveau du shell.
    const appRow = [...appCss.matchAll(/\.app-row\s*\{([^}]*)\}/g)].map((m) => m[1]);
    expect(appRow.length, ".app-row doit exister").toBeGreaterThan(0);
    for (const block of appRow) {
      expect(block, ".app-row ne doit jamais repeindre le fond des cartes").not.toMatch(/background:\s*var\(--bg\)/);
    }
    const mainCard = [...appCss.matchAll(/\.main-card\s*\{([^}]*)\}/g)].map((m) => m[1]);
    for (const block of mainCard) {
      expect(block, ".main-card est un conteneur pur").not.toMatch(/background:\s*var\(--bg\)/);
    }
    // --canvas et --grip se DÉRIVENT de --bg/--fg : les presets de thème ne
    // posent que la palette de base en style inline, une valeur en dur y
    // laissait un sol d'une autre famille (sol bleuté sous Gruvbox) ou plus
    // clair que le contenu sous les presets clairs.
    for (const decl of [/--canvas:\s*color-mix\(in srgb, var\(--bg\)/, /--grip:\s*color-mix\(in srgb, var\(--fg\)/]) {
      expect(appCss.match(new RegExp(decl.source, "g"))?.length,
        `${decl} doit être dérivé dans les DEUX thèmes`).toBe(2);
    }
  });

  // Écarts 2026-09-06 (relevé design) : les ombres de surfaces élevées
  // (menus/popovers/modales) passent par --elev, les chips/cartes/petits
  // contrôles flottants par --elev-soft — plus de rgba(0,0,0,…) littéral en
  // dehors des palettes :root. Trois exceptions JUSTIFIÉES restent : ce ne
  // sont pas des surfaces (fond+contenu), mais des ombres de PETITS CONTRÔLES
  // ou de retour visuel ponctuel — allowlist gelée, ne peut que rétrécir.
  //   - .slider::-webkit-slider-thumb (App.css) : galet de curseur, ombre de
  //     relief sur un knob de 14px, pas une surface élevée.
  //   - .workspace-drop-preview (App.css) : halo de retour visuel pendant un
  //     drag, combiné à un anneau interne teinté --info — sémantique de
  //     drop-target, pas un rôle d'élévation statique.
  it("box-shadow : aucun rgba() littéral hors :root (App.css + CSS de composants), sauf allowlist gelée", () => {
    const stripRoot = (css: string) => css.replace(/^:root[^{]*\{[^}]*\}/gm, "");
    const rgbaShadowAllow = [
      { file: "App.css", needle: ".slider::-webkit-slider-thumb", pattern: /\.slider::-webkit-slider-thumb\s*\{[^}]*box-shadow:[^;]*rgba\(/ },
      { file: "App.css", needle: ".workspace-drop-preview", pattern: /^\.workspace-drop-preview \{[^}]*box-shadow:[^;]*rgba\(/m },
    ];
    const appBody = stripRoot(appCss);
    const rawShadows = [...appBody.matchAll(/box-shadow:[^;]*rgba\([^;]*;/g)].map((m) => m[0]);
    const allowedCount = rgbaShadowAllow.filter((a) => a.file === "App.css" && a.pattern.test(appBody)).length;
    expect(
      rawShadows.length,
      `box-shadow rgba() hors allowlist dans App.css : ${rawShadows.join(" | ")}`,
    ).toBe(allowedCount);
    for (const path of componentCssFiles) {
      const css = stripRoot(stripComments(readFileSync(path, "utf8")));
      expect(css, `${path} : box-shadow rgba() littéral interdit hors App.css`).not.toMatch(/box-shadow:[^;]*rgba\(/);
    }
  });

  // 2026-09-06 : les éditeurs et viewers de la galerie démarraient sur une
  // palette « Default » legacy (#202024, #e8823a…) différente d'App.css —
  // flash à chaque ouverture avant le message atelier-theme. Migrée vers les
  // jetons canoniques ; cette assertion interdit son retour (bundles exclus :
  // ils se régénèrent depuis gallery/src).
  it("gallery : aucun hex legacy des éditeurs hors bundles", () => {
    const legacyHex = /#(202024|27272a|1f1f23|dbdfe5|a1a1aa|e8823a|5b9dff|3f3f46)\b/i;
    const galleryRoot = join(root, "..", "gallery");
    // Preserve the editor palette contract: migrated legacy browser helpers
    // retain their pre-existing styles, just as their former assets/*.js sources did.
    const tsFiles = collectFiles(join(galleryRoot, "src", "studio"), [".ts"]);
    const assetFiles = collectFiles(join(galleryRoot, "assets"), [".css", ".html"]).filter(
      (p) => !p.endsWith(".bundle.js"),
    );
    const offenders: string[] = [];
    for (const p of [...tsFiles, ...assetFiles]) {
      if (legacyHex.test(readFileSync(p, "utf8"))) offenders.push(p);
    }
    expect(offenders, `hex legacy trouvé : ${offenders.join(", ")}`).toEqual([]);
  });

  // Écarts 2026-09-06 : rayons hors échelle 6/10/999 — toute valeur px
  // LITTÉRALE doit tomber sur 6/10/999 (idéalement via var(--r-*)/
  // var(--radius-*), mais un littéral déjà sur l'échelle n'est pas une
  // infraction). Les unités non-px (em, %, 0) et var() sont hors du périmètre
  // de cette règle — d'autres contrats couvrent déjà var().
  it("border-radius : aucune valeur px hors 6/10/999 dans src/**/*.css et App.css", () => {
    const cssFiles = collectFiles(root, [".css"]).filter(
      (p) => !p.includes(join("components", "shadcn")),
    );
    const onScale = new Set(["6px", "10px", "999px"]);
    const offenders: string[] = [];
    for (const path of cssFiles) {
      const css = stripComments(readFileSync(path, "utf8"));
      for (const m of css.matchAll(/border-radius:\s*([^;]+);/g)) {
        const v = m[1].trim();
        if (!/^\d+(\.\d+)?px$/.test(v)) continue; // seules les valeurs px littérales sont notées ici
        if (onScale.has(v)) continue;
        offenders.push(`${path} : ${v}`);
      }
    }
    expect(offenders, `border-radius px hors échelle : ${offenders.join(", ")}`).toEqual([]);
  });

  // Unification des menus/popovers React (passe 2026-09-06, décision Thierry) :
  // un seul modèle — celui de DropdownMenuContent/ContextMenuContent shadcn —
  // fond + ombre d'élévation, JAMAIS de bordure. Chaque nom ci-dessous peut
  // porter plusieurs règles dans App.css (ex. `.model-menu .model-list` en
  // plus de `.model-list` nu) ; on les regroupe toutes par nom de classe et on
  // vérifie l'ensemble — allowlist gelée si une exception se justifie un jour
  // (aucune pour l'instant).
  it("menus : fond + ombre, jamais de bordure", () => {
    const names = [
      "proj-menu", "mp-menu", "model-provider-list", "model-list",
      "ctx-pop", "suggest", "reviewer-menu", "pin-menu",
    ];
    const rules = [...appCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selector: m[1].trim().replace(/\s+/g, " "),
      body: m[2],
    }));
    for (const name of names) {
      // le nom doit apparaître comme un TOKEN de classe complet, et comme la
      // CIBLE (dernier maillon) d'un des sélecteurs de la liste — `.proj-menu`
      // mais pas `.proj-menu-head`, `.model-provider-list` ne doit pas
      // capturer `.model-list`, et `.mp-menu input[type="checkbox"]` (widget
      // interne, pas la surface) ne doit pas capturer `.mp-menu`.
      const token = new RegExp(`\\.${name}(?![\\w-])`);
      const isTarget = (selector: string) =>
        selector.split(",").some((part) => token.test(part.trim().split(/\s+/).pop() ?? ""));
      const matches = rules.filter((r) => isTarget(r.selector));
      expect(matches.length, `aucune règle trouvée pour .${name}`).toBeGreaterThan(0);
      for (const r of matches) {
        expect(r.body, `.${name} (« ${r.selector} ») porte encore une bordure`).not.toMatch(/border(?!-radius):/);
      }
      // .pin-menu ne possède pas son propre fond : le chrome (fond + ombre +
      // rayon-surface, sans bordure) vient du PopoverContent partagé
      // (shadcn/popover.tsx : bg-popover + shadow-[var(--elevation-overlay)]),
      // vérifié par le contrat « géométrie commune » plus haut. Une classe qui
      // ne pose pas de `background:` elle-même délègue donc légitimement
      // l'ombre au primitif — seules celles qui possèdent leur PROPRE fond
      // doivent aussi porter leur propre box-shadow: var(--elev...).
      const ownsBackground = matches.some((r) => /\bbackground:/.test(r.body));
      const hasElev = matches.some((r) => /box-shadow:\s*var\(--elev/.test(r.body));
      expect(
        hasElev || !ownsBackground,
        `.${name} : possède son propre fond mais aucune de ses règles ne porte box-shadow: var(--elev...)`,
      ).toBe(true);
    }
  });

  // Même règle, mais DÉCOUVERTE par motif : un menu créé demain (`.foo-menu`,
  // `.bar-pop`, `.baz-dropdown`) est attrapé sans qu'on pense à l'ajouter à la
  // liste ci-dessus. Cible = dernier maillon d'un sélecteur dont une classe
  // contient menu / pop / popover / dropdown, ET qui pose son propre fond
  // (une surface) — les rangées, en-têtes, icônes et wrappers sont ignorés.
  // Allowlist gelée : chaque entrée dit pourquoi ce n'est PAS une surface de menu.
  it("menus (par motif) : toute surface *menu*/*pop*/*dropdown* = fond + ombre, sans bordure", () => {
    const notMenus = new Set<string>([
      "proj-menu-head", // en-tête teinté DANS .proj-menu (couleur du projet), pas une surface
      "proj-menu-sep", // filet séparateur de 1 px DANS .proj-menu
    ]);
    const rules = [...appCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selector: m[1].trim().replace(/\s+/g, " "),
      body: m[2],
    }));
    const pattern = /\.([\w-]*(?:menu|popover|pop|dropdown)[\w-]*)/;
    const bySurface = new Map<string, { selectors: string[]; bodies: string[] }>();
    for (const r of rules) {
      if (r.selector.startsWith("@") || r.selector.includes(":root")) continue;
      for (const part of r.selector.split(",")) {
        const last = part.trim().split(/\s+/).pop() ?? "";
        // uniquement la classe elle-même (pas `.menu li`, pas `.menu:hover`)
        const m = /^\.([\w-]+)$/.exec(last);
        if (!m || !pattern.test(last)) continue;
        const name = m[1];
        if (notMenus.has(name)) continue;
        const entry = bySurface.get(name) ?? { selectors: [], bodies: [] };
        entry.selectors.push(r.selector);
        entry.bodies.push(r.body);
        bySurface.set(name, entry);
      }
    }
    const offenders: string[] = [];
    for (const [name, entry] of bySurface) {
      // NB : le lookahead négatif vient AVANT les blancs (`:(?!\s*none)`), sinon
      // `\s*` rétrograde d'un cran et « border: none » passe pour une bordure.
      // `background: transparent|none` = wrapper (ex. .model-menu autour de .model-list), pas une surface
      const ownsBackground = entry.bodies.some((b) => /\bbackground(?:-color)?:(?!\s*(?:transparent|none)\b)/.test(b));
      if (!ownsBackground) continue; // pas une surface : rangée, wrapper, icône
      const hasBorder = entry.bodies.some((b) => /(?:^|[;\s])border(?!-radius)(?:-(?:top|right|bottom|left))?:(?!\s*(?:none|0)\b)/.test(b));
      const hasElev = entry.bodies.some((b) => /box-shadow:\s*var\(--elev/.test(b));
      if (hasBorder) offenders.push(`.${name} : bordure`);
      if (!hasElev) offenders.push(`.${name} : pas d'ombre var(--elev…)`);
    }
    expect(bySurface.size, "le motif ne trouve plus aucun menu — motif cassé ?").toBeGreaterThan(3);
    expect(offenders, offenders.join(" · ")).toEqual([]);
  });
});

// Finitions 2026-09-29 : trait des icônes, étiquettes de section, grille de 4.
describe("contrat finitions (icônes, étiquettes, grille de 4)", () => {
  const chromeSheets = (): [string, string][] => [
    ["App.css", appCss],
    ...collectFiles(join(root, "styles"), [".css"])
      .filter((file) => !file.endsWith("typeset.css")) // prose du chat : em, pas de chrome
      .map((file) => [file, stripComments(readFileSync(file, "utf8"))] as [string, string]),
    ...componentCssFiles.map((file) => [file, stripComments(readFileSync(file, "utf8"))] as [string, string]),
  ];
  const rules = (css: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selector: m[1].trim(), body: m[2] }));

  it("les icônes lucide sans trait explicite sortent à 1,4 (et non 2)", () => {
    expect(tokens).toMatch(/@layer base\s*\{\s*:where\(svg\.lucide\[stroke-width="2"\]\)\s*\{\s*stroke-width:\s*1\.4;?\s*\}/);
  });

  it("toute étiquette en capitales prend l'espacement unique --eyebrow-tracking", () => {
    const offenders: string[] = [];
    for (const [name, css] of chromeSheets()) {
      for (const r of rules(css)) {
        if (!/text-transform:\s*uppercase/.test(r.body)) continue;
        if (!/letter-spacing:\s*var\(--eyebrow-tracking\)/.test(r.body)) offenders.push(`${name} → ${r.selector}`);
      }
    }
    expect(offenders, offenders.join(" · ")).toEqual([]);
    expect(tokens).toContain("--eyebrow-tracking: .06em");
  });

  it("espacements sur la grille de 4 (2 et 6 tolérés comme demi-pas)", () => {
    const offGrid = /(?:^|[;\s{])((?:padding|margin)(?:-[a-z-]+)?|gap|row-gap|column-gap)\s*:\s*([^;{}]*)/g;
    const bad = new Set([3, 5, 7, 9, 10, 11, 13, 14, 15, 17]);
    const offenders: string[] = [];
    for (const [name, css] of chromeSheets()) {
      for (const m of css.matchAll(offGrid)) {
        for (const tok of m[2].split(/\s+/)) {
          const v = /^(\d+)px$/.exec(tok);
          if (v && bad.has(Number(v[1]))) offenders.push(`${name} → ${m[1]}: ${m[2].trim()}`);
        }
      }
    }
    expect(offenders, offenders.slice(0, 20).join(" · ")).toEqual([]);
  });

  it("pannes visibles du lot 1 : les surcharges qui cassaient les primitives restent mortes", () => {
    const shadcnTooltip = shadcnSources.find(([name]) => name === "tooltip.tsx")?.[1] ?? "";
    const shadcnAlert = shadcnSources.find(([name]) => name === "alert-dialog.tsx")?.[1] ?? "";
    const shadcnEmpty = shadcnSources.find(([name]) => name === "empty.tsx")?.[1] ?? "";
    // SHELL-01 / TRANS-24 : la palette hérite voile (--scrim) et empilement
    // (--z-modal) de DialogContent ; elle s'ancre en haut sans top/translate
    expect(appCss).not.toMatch(/\.cmdk-dialog-overlay\s*\{/);
    const palette = appCss.match(/^\.cmdk-panel\s*\{[^}]*\}/m)?.[0] ?? "";
    expect(palette).toContain("align-self: flex-start");
    expect(palette).toMatch(/max-width:\s*min\(520px/);
    expect(palette).not.toMatch(/[\s;{]top:|translate/);
    // PRIM-01 : le Positioner de Base UI place la bulle — jamais de position
    // ni de z-index sur le Popup, ni de flèche couleur texte
    const tooltip = primitives.match(/^\.ui-tooltip\s*\{[^}]*\}/m)?.[0] ?? "";
    expect(tooltip).not.toMatch(/position:|z-index:/);
    expect(primitives).not.toMatch(/\.ui-tooltip\.open/);
    expect(shadcnTooltip).not.toContain("TooltipPrimitive.Arrow");
    expect(shadcnTooltip).not.toContain("tw:bg-foreground");
    expect(appCss).not.toMatch(/\.follow-up-tooltip\s*\{[^}]*position:/);
    // PRIM-02 : sans Preflight, une bordure sans couleur tombe sur --sh-border
    // (couche base), et le pied de dialogue par défaut est sans bande ni filet
    expect(shadcn).toMatch(/@layer base\s*\{[^}]*border-color:\s*var\(--sh-border\)/);
    expect(shadcnDialog).not.toMatch(/data-slot="dialog-footer"[\s\S]{0,80}tw:border-t/);
    expect(shadcnAlert).toMatch(/AlertDialogFooter\(\{\s*className,\s*variant = "plain"/);
    expect(shadcnAlert).toMatch(/AlertDialogCancel\(\{\s*className,\s*variant = "secondary"/);
    // SURF-01 / SURF-02 : pas de cadre pointillé medium, carte non étirée
    expect(shadcnEmpty).toContain("tw:border-dashed");
    expect(primitives).toMatch(/:where\(\[data-slot="empty"\]\)\s*\{\s*border:\s*0;/);
    expect(primitives).toMatch(/^\.ui-empty\s*\{[^}]*flex:\s*none/m);
    // CHAT-03 : Arrêter garde le disque d'Envoyer — aucune couleur propre
    const stop = appCss.match(/^\.send\.stop\s*\{[^}]*\}/m)?.[0] ?? "";
    expect(stop).not.toMatch(/background|color/);
    // CHAT-14 / SURF-08 : l'action principale a UN remplissage partout — les
    // jetons --fill-* (jamais l'encre depuis 2026-10-21, voir le contrat dédié)
    expect(appCss).not.toMatch(/\.perm-allow\s*\{[^}]*background/);
    expect(appCss).not.toMatch(/\.git-commit-buttons \.ui-btn--primary/);
    expect(appCss).not.toMatch(/\.generateur-generate\s*\{[^}]*background/);
    // SET-12 : plus de géométrie de bouton propre aux Réglages
    expect(appCss).not.toMatch(/^\.set-btn\s*\{/m);
    expect(appCss).not.toMatch(/\.set-btn[^{]*\{[^}]*(border-radius|padding|font-size)/);
    // SURF-14 : une durée suivie de var(--ease) devient un délai
    expect(appCss).not.toMatch(/\d+ms var\(--ease[,)]/);
    // TRANS-17 : les contrôles natifs suivent le thème de l'app
    expect(appCss).toMatch(/^:root, :root\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark/m);
    expect(appCss).toMatch(/^:root\[data-theme="light"\]\s*\{[^}]*color-scheme:\s*light/m);
  });

  // Thierry, 2026-10-21 : « j'aime pas le blanc dans les boutons nulle part
  // dans Atelier ». Un bouton plein, une case cochée, un interrupteur actif
  // ou un radio choisi se peignent aux jetons --fill-* de tokens.css, jamais
  // à l'encre (--text-primary / --fg = blanc en sombre). Changer d'option
  // (relief, accent plein, accent doux) = changer les valeurs des jetons.
  it("aucun bouton ne prend l'encre comme fond : remplissage par les jetons --fill-*", () => {
    const tokenValue = (name: string) => tokens.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim() ?? "";
    for (const name of ["--fill-primary", "--fill-primary-hover", "--on-fill-primary",
      "--fill-secondary", "--fill-secondary-hover", "--fill-secondary-ring"]) {
      expect(tokenValue(name), `${name} défini dans tokens.css`).not.toBe("");
    }
    for (const name of ["--fill-primary", "--fill-primary-hover"]) {
      expect(tokenValue(name)).not.toMatch(/^var\(--(text-primary|fg|txt|foreground|primary)\)$/);
    }
    // --primary reste l'encre (texte, icônes, liens) : jamais redéfini en fond
    expect(shadcn).toContain("--primary: var(--text-primary)");
    expect(shadcn).toContain("--color-fill-primary: var(--fill-primary)");
    // primitives shadcn : ni bg-primary ni bg-foreground en aplat
    const filled = ["button.tsx", "badge.tsx", "bubble.tsx", "checkbox.tsx", "switch.tsx", "radio-group.tsx"];
    for (const [file, src] of shadcnSources.filter(([file]) => filled.includes(file))) {
      expect(src, file).not.toMatch(/\bbg-(?:primary|foreground)\b/);
    }
    expect(shadcnButton).toMatch(/default: "tw:bg-fill-primary tw:text-on-fill-primary tw:hover:bg-fill-primary-hover/);
    expect(shadcnButton).toMatch(/secondary:\s*"tw:border-fill-secondary-ring tw:bg-fill-secondary[^"]*tw:hover:bg-fill-secondary-hover/);
    // CSS de l'app : l'encre en aplat n'est permise qu'aux marques non
    // cliquables (pastille numérotée, trait de lecture) et au pouce d'effort.
    const inkFill = /background(?:-color)?:\s*var\(--(?:text-primary|fg|txt)\)/;
    const allowed = [".user-annot-badge", ".tl-mark[data-here] .tl-mark-sign", ".effort-menu .ef-thumb"];
    const offenders: string[] = [];
    for (const [file, css] of [["App.css", appCss], ...componentCssFiles.map((f) => [f, stripComments(readFileSync(f, "utf8"))])]) {
      for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!inkFill.test(body)) continue;
        const sel = selector.trim();
        if (!allowed.includes(sel)) offenders.push(`${file}: ${sel}`);
      }
    }
    expect(offenders, `aplat à l'encre hors marques autorisées : ${offenders.join(", ")}`).toEqual([]);
    for (const sel of ["\\.composer-bar \\.send", "\\.composer-recording-bar \\.dictation-send"]) {
      expect(appCss).toMatch(new RegExp(`${sel}\\s*\\{[^}]*background:\\s*var\\(--fill-primary\\);\\s*color:\\s*var\\(--on-fill-primary\\)`));
      expect(appCss).toMatch(new RegExp(`${sel}:hover:not\\(:disabled\\)\\s*\\{[^}]*background:\\s*var\\(--fill-primary-hover\\)`));
    }
    // Les rangées de remplissage voyagent jusqu'aux éditeurs de la galerie
    expect(galleryStyles).not.toMatch(/\[data-checked\][^{]*\{[^}]*background:var\(--primary(?:-foreground)?\)/);
  });
});

describe("contrat lot 2 (socle)", () => {
  const sourceSheets = (): [string, string][] => [
    ["App.css", appCss],
    ...collectFiles(join(root, "styles"), [".css"])
      .map((file) => [file, stripComments(readFileSync(file, "utf8"))] as [string, string]),
    ...componentCssFiles.map((file) => [file, stripComments(readFileSync(file, "utf8"))] as [string, string]),
  ];

  it("THIERRY-01 : une seule barre de défilement, réglée par --scrollbar-size", () => {
    const shared = stripComments(readFileSync(join(root, "..", "gallery", "assets", "scrollbars.css"), "utf8"));
    expect(shared).toMatch(/:root\s*\{[^}]*--scrollbar-size:\s*6px/);
    expect(shared).toMatch(/(^|\})\s*::-webkit-scrollbar\s*\{\s*width:\s*var\(--scrollbar-size\);\s*height:\s*var\(--scrollbar-size\)/);
    expect(shared).toMatch(/::-webkit-scrollbar-thumb\s*\{[^}]*var\(--scroll-thumb\)/);
    expect(shared.match(/--scrollbar-size:/g)).toHaveLength(1);
    // barre de la fenêtre (galerie en iframe) : sous une piste transparente,
    // WebKit montre ce qui est derrière le cadre ; elle prend le fond de la page
    expect(shared).toMatch(/:where\(html,\s*body\)::-webkit-scrollbar-track,\s*:where\(html,\s*body\)::-webkit-scrollbar-corner\s*\{\s*background:\s*var\(--bg,\s*Canvas\)/);
    expect(shared).toMatch(/:root\s*\{[^}]*scrollbar-color:[^;}]*var\(--scroll-thumb\)\s+var\(--bg,\s*Canvas\)/);
    expect(shared).toMatch(/(^|\})\s*body\s*\{\s*scrollbar-color:[^;}]*var\(--scroll-thumb\)\s+transparent/);
    // le reste de l'app ne peut que MASQUER une barre, jamais la redimensionner
    for (const [name, css] of sourceSheets()) {
      for (const m of css.matchAll(/([^{}]*::-webkit-scrollbar[^{]*)\{([^}]*)\}/g)) {
        const body = m[2];
        const hides = /display:\s*none/.test(body);
        expect(hides, `${name} : barre locale « ${m[1].trim()} »`).toBe(true);
      }
    }
    expect(readFileSync(join(root, "App.css"), "utf8")).toMatch(/^@import "\.\.\/gallery\/assets\/scrollbars\.css";/);
    const scrollArea = shadcnSources.find(([name]) => name === "scroll-area.tsx")?.[1] ?? "";
    expect(scrollArea).toContain("w-[var(--scrollbar-size)]");
    expect(scrollArea).not.toMatch(/tw:data-vertical:w-2\.5/);
  });

  it("cadres de documents : jamais de fond blanc derrière une piste de barre transparente", () => {
    // WebKit montre le fond de l'élément iframe sous la piste transparente de la
    // barre de la fenêtre du document : un #fff donnait une barre blanche en
    // sombre (lecteur PDF de la bibliothèque, Thierry, 2026-10-28).
    const app = stripComments(readFileSync(join(root, "App.css"), "utf8"));
    const rule = (sel: string) => app.match(new RegExp(`(^|\\})\\s*${sel.replace(".", "\\.")}\\s*\\{([^}]*)\\}`))?.[2] ?? "";
    expect(rule(".biblio-frame")).toMatch(/background:\s*transparent/);
    expect(rule(".biblio-frame-wrap")).toMatch(/background:\s*var\(--surface-canvas\)/);
  });

  it("cadres d'Atelier : la barre que la page masque ne retombe pas sur le style de l'iframe hôte", () => {
    // Mesuré dans WKWebView (macOS 27, WebKit 22625, 2026-10-28) : une page en
    // cadre qui masque la barre de sa fenêtre la voit redessinée avec le style
    // ::-webkit-scrollbar de l'élément iframe de l'hôte, piste transparente
    // peinte en blanc. Seul un masquage côté hôte l'enlève.
    const shared = stripComments(readFileSync(join(root, "..", "gallery", "assets", "scrollbars.css"), "utf8"));
    expect(shared).toMatch(/iframe:is\(\.atelier,\s*\[data-atelier-role\]\)::-webkit-scrollbar\s*\{\s*display:\s*none/);
    const ragdoc = readFileSync(join(root, "components", "RagdocWorkspace.tsx"), "utf8");
    expect(ragdoc).toMatch(/<iframe data-atelier-role="ragdoc-pdf"/);
  });

  it("A4 : la méta lisible est en --text-muted ; --text-disabled reste aux marques et au désactivé", () => {
    const all = sourceSheets().map(([, css]) => css).join("\n");
    // budget gelé : chevrons, séparateurs, puces, coches, poignées,
    // placeholders, :disabled, étoiles non posées (ne peut que rétrécir)
    const disabledText = [...all.matchAll(/(^|[^-\w])color:\s*var\(--text-disabled\)/g)].length;
    expect(disabledText).toBeLessThanOrEqual(46);
    for (const sel of [
      ".row-time", ".sidebar li.thread-recency-label", ".sidebar button.pnav-more", ".pnav-row .prov-ico",
      ".cmdk-footer", ".resume-date", ".tool-duration", ".timeline-stamp", ".msg-actions", ".msg-actions button",
      ".agent-row-type", ".changed-files-dir", ".git-path-dir", ".hl-foot", ".kb-meta", ".ur-l", ".ur-sub",
      ".ur-mrow em", ".pasted-thumb figcaption", ".appsnap-local-note", ".calculs-run-hint", ".evidence-group-loc",
    ]) {
      const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rule = appCss.match(new RegExp(`(^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m"))?.[2] ?? "";
      expect(rule, `${sel} introuvable`).not.toBe("");
      expect(rule, `${sel} écrit en gris éteint`).not.toContain("--text-disabled");
    }
    expect(primitives).toMatch(/\.ui-activity-meta\s*\{[^}]*color:\s*var\(--text-muted\)/);
    expect(appCss).not.toMatch(/\.appsnap-local-note\s*\{[^}]*margin:\s*-/);
    // l'accent écrit passe par --accent-text (lisible) ; --accent reste le remplissage
    expect([...all.matchAll(/(^|[^-\w])color:\s*var\(--accent\)/g)].length).toBeLessThanOrEqual(2);
    expect(tokens).toContain("--accent-text: var(--accent)");
  });

  it("A5 : hauteurs sur l'échelle 24/28/32, un seul anneau de focus, un seul désactivé", () => {
    // hauteurs : aucun contrôle shadcn ne garde une hauteur Tailwind numérique
    for (const name of ["button.tsx", "select.tsx", "input.tsx", "input-group.tsx", "toggle.tsx", "toggle-group.tsx"]) {
      const src = shadcnSources.find(([n]) => n === name)?.[1] ?? "";
      expect(src, name).not.toMatch(/tw:(h|size)-(5|6|7|8|9|10)\b/);
    }
    expect(primitives).toMatch(/\.ui-iconbtn--s\s*\{[^}]*var\(--control-height-s\)/);
    expect(primitives).toMatch(/\.ui-iconbtn--l\s*\{[^}]*var\(--control-height-l\)/);
    // focus : la recette unique (jetons) dans shadcn, plus de ring-N ni outline-2
    for (const [name, src] of shadcnSources) {
      expect(src, name).not.toMatch(/focus-visible:ring-[1-9]|focus-visible:outline-2|outline-ring\b/);
      expect(src, name).not.toMatch(/disabled:opacity-50|opacity-50/);
    }
    // et dans les feuilles : tout outline posé au focus est l'anneau commun (ou none)
    const offenders: string[] = [];
    for (const [name, css] of sourceSheets()) {
      for (const m of css.matchAll(/([^{}]*:focus(?:-visible)?[^{]*)\{([^}]*)\}/g)) {
        for (const o of m[2].matchAll(/(?:^|;)\s*outline\s*:\s*([^;]+)/g)) {
          const v = o[1].trim();
          if (v === "none" || /^var\(--focus-ring-width\) solid var\(--focus-ring-color\)$/.test(v) || /transparent/.test(v)) continue;
          offenders.push(`${name} ${m[1].trim()} → ${v}`);
        }
      }
    }
    expect(offenders).toEqual([]);
    // désactivé : l'opacité unique --disabled-opacity (hors envoi du composeur,
    // section effort/modèle, et les « restes pleins » à opacity: 1 explicites)
    expect(tokens).toMatch(/--disabled-opacity:\s*\.5/);
    const literal = [...appCss.matchAll(/([^{}]*:disabled[^{]*)\{([^}]*)\}/g)]
      .filter((m) => /opacity:\s*0?\.\d/.test(m[2]))
      .map((m) => m[1].trim());
    expect(literal.every((sel) => /\.send|tier-toggle/.test(sel)), literal.join(" | ")).toBe(true);
    // survol < ouvert/pressé sur les boutons-icônes ; une seule croix ; une seule recherche
    expect(primitives).toMatch(/\.ui-iconbtn:hover:not\(:disabled\)\s*\{[^}]*var\(--surface-hover\)/);
    expect(primitives).toMatch(/\.ui-iconbtn:is\(\[aria-pressed="true"\], \[aria-expanded="true"\], \[data-popup-open\]\)/);
    expect(primitives).toMatch(/\.ui-search \.ui-search-input\s*\{[^}]*var\(--border-interactive\)/);
    expect(appCss).not.toMatch(/\.(exp|pnav|resume)-search\s*\{[^}]*border:/);
  });

  it("A11 : un tempo de rotation, un squelette, aucune géométrie animée", () => {
    const sheets = sourceSheets();
    const all = sheets.map(([, css]) => css).join("\n");
    // plus de keyframes de rotation doublons : tout tourne sur ui-spin
    for (const dup of ["spin", "arcSpin", "narval-spin", "kb-article-spin", "tool-run-spin", "agent-working-spin", "chat-notice-spin", "turn-star-rotate", "working-pulse", "turn-working-sweep"]) {
      expect(all, `@keyframes ${dup}`).not.toMatch(new RegExp(`@keyframes\\s+${dup}\\s*\\{`));
    }
    // toute rotation continue suit --motion-spin
    for (const m of all.matchAll(/animation:\s*(ui-spin|rail-act-turn)\s+([^\s;]+)/g)) {
      expect(m[2], m[0]).toBe("var(--motion-spin)");
    }
    // le squelette est statique (pas de animate-pulse) et n'apparaît qu'après 350 ms
    const skeleton = shadcnSources.find(([n]) => n === "skeleton.tsx")?.[1] ?? "";
    expect(skeleton).not.toMatch(/animate-pulse/);
    expect(appCss).toMatch(/@keyframes skeleton-appear/);
    // la barre de progression ne prend jamais l'accent
    expect(appCss).not.toMatch(/\.kb-article-progress i\s*\{[^}]*var\(--accent\)/);
    // aucune transition de géométrie (largeur, hauteur, rangées de grille),
    // hors section effort/modèle (réécrite ailleurs)
    const geometry: string[] = [];
    for (const [name, css] of sheets) {
      for (const m of css.matchAll(/([^{}]*)\{([^}]*)\}/g)) {
        if (/\.ef-/.test(m[1])) continue;
        const tr = m[2].match(/transition:\s*([^;]+)/)?.[1] ?? "";
        if (/(^|,\s*)(width|height|min-height|max-height|grid-template-rows)\b/.test(tr)) geometry.push(`${name} ${m[1].trim()}`);
      }
    }
    expect(geometry).toEqual([]);
    // les surfaces ancrées entrent depuis leur déclencheur (data-side)
    expect(shadcn).toMatch(/\[data-side="top"\]/);
    expect(shadcn).toMatch(/\[data-starting-style\], \[data-ending-style\]/);
    expect(tokens).toMatch(/--enter-offset:\s*4px/);
  });

  it("A13 : un repère de sélection par liste, fond seul dans les barres, survol plus léger", () => {
    const sheets = sourceSheets();
    expect(tokens).toMatch(/--selection-marker-w:\s*2px/);
    expect(tokens).toMatch(/--selection-marker-h:\s*16px/);
    // UNE règle de repère : pilule 2×16 en --selection-line + fond --bg-ctl
    const marker = [...appCss.matchAll(/:is\(([^{]*)\)::before\s*\{([^}]*)\}/g)]
      .find((m) => /--selection-marker-h/.test(m[2]));
    expect(marker, "règle de repère commune").toBeTruthy();
    for (const sel of [".sidebar li.active", ".rail-view.on", ".rail-proj.on", '.cmdk-item[data-selected="true"]', ".set-nav-item.on",
      '.biblio-row[aria-selected="true"]', ".git-file.selected", '.narval-run[data-state="selected"]', '.exp-row[data-open="true"]']) {
      expect(marker![1], sel).toContain(sel);
    }
    expect(marker![2]).toMatch(/background:\s*var\(--selection-line\)/);
    // aucune autre marque de sélection : ni pseudo-élément accent sur un état
    // actif, ni liseré inset 2 px (hors la sélection de modèle, réécrite ailleurs)
    const strays: string[] = [];
    for (const [name, css] of sheets) {
      for (const m of css.matchAll(/([^{}]*)\{([^}]*)\}/g)) {
        const sel = m[1].trim();
        if (/model-provider-row|--selection-marker/.test(sel + m[2])) continue;
        if (/(\.on|\.active|\.selected|\.is-active|-selected="true"\]|aria-current="true"\])[^,]*::(before|after)/.test(sel)
          && /var\(--(accent|selection-line)\)/.test(m[2])) strays.push(`${name} ${sel}`);
        if (/(\.on|\.active|\.selected|\.is-active|="selected"\])/.test(sel)
          && /inset 2px 0( 0)? var\(--(accent|selection-line)\)/.test(m[2])) strays.push(`${name} ${sel}`);
      }
    }
    expect(strays).toEqual([]);
    // barres horizontales : fond seul, sans soulignement
    expect(appCss).not.toMatch(/\.topbar-surface\.on::after/);
    expect(appCss).not.toMatch(/tabs-trigger"\]\[data-active\]\s*\{[^}]*box-shadow:\s*inset 0 -1px/);
    const docTabs = stripComments(readFileSync(join(root, "styles", "document-tabs.css"), "utf8"));
    expect(docTabs).not.toMatch(/\[data-active="true"\][^{]*\{[^}]*border-color/);
    // le survol des listes reste plus léger que la sélection
    const all = sheets.map(([, css]) => css).join("\n");
    for (const row of ["docs-row", "biblio-folder", "kbs-rail-item", "git-commit-row", "set-nav-item", "narval-job-row"]) {
      expect(all, `${row}:hover`).toMatch(new RegExp(`\\.${row}:hover\\s*\\{[^}]*var\\(--surface-hover\\)`));
    }
    // terminal actif et volet actif signalés en vue partagée
    expect(appCss).toMatch(/\.term-grid:not\(\.single\) \.term-cell\.focus::after\s*\{[^}]*var\(--selection-line\)/);
    expect(appCss).toMatch(/\.workspace-split \.workspace-pane\.is-focused > \.workspace-pane-tabs\s*\{[^}]*var\(--selection-line\)/);
  });
});
