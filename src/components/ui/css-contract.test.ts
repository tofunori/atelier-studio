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

describe("contrat Quiet Instrument (sources CSS)", () => {
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
      "90": 1, "95": 1, "120": 1, "160": 1, "240": 1, "260": 1, "285": 1,
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

  it("frontière d'imports : shadcn/button et shadcn/tooltip via les wrappers ui/ (allowlist gelée)", () => {
    // Ces deux primitives ont des wrappers produit complets (Button/IconButton/
    // RowButton, Tooltip). La liste ci-dessous fige l'existant : elle ne peut
    // QUE rétrécir — retirer une entrée quand on migre le fichier, ne jamais
    // en ajouter.
    const allowed = new Set([
      "components/RemoteDevicesPanel.tsx",
      "components/QuickAsk.tsx",
      "components/Automations.tsx",
      "components/chat/ContextShelf.tsx",
      "components/chat/ImageViewPreview.tsx",
      "components/chat/turns.tsx",
      "components/chat/AgentActivity.tsx",
    ]);
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
          if (/from\s+"[^"]*shadcn\/(button|tooltip)"/.test(src) && !allowed.has(r)) offenders.push(r);
        }
      }
    };
    walk(root, "");
    expect(offenders, `import direct shadcn/button|tooltip hors allowlist : ${offenders.join(", ")}`).toEqual([]);
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

  // §9 : « Maximum une animation continue (boucle) par surface — un seul
  // spinner ou indicateur running à la fois ». Le fil de chat en empilait sept,
  // non harmoniques (1,4 s / 2 s / 4 s, elles battaient les unes contre les
  // autres). Boucle unique retenue : l'anneau accent de .working-label, présent
  // tant que le tour tourne et porteur de la durée écoulée. Tout le reste se
  // différencie par la COULEUR et le TEXTE (--status-running, libellé), pas par
  // le mouvement. Hors périmètre : le spinner de la barre Reviewer (.rb-spin),
  // bannière au-dessus du fil, jamais co-visible — une revue ne démarre que sur
  // un tour terminé.
  it("chat : une seule boucle continue pendant un tour actif", () => {
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
      ".ui-activity-label.is-shimmering",
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
    expect(loops).toEqual([".working-label::before"]);
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
    // seule durée en secondes tolérée : la rotation du spinner (continue, pas
    // une transition d'état)
    const rawS = primitives.match(/\b\d+(\.\d+)?s\b/g) ?? [];
    expect(rawS).toEqual(["0.9s"]);
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
    expect(tokens).toContain("--control-height: 30px");
    expect(tokens).toContain("--control-height-compact: 26px");
    expect(tokens).toContain("--border-interactive:");
    expect(shadcn).toContain("--color-background: var(--background)");
    expect(shadcn).toContain("--color-ring: var(--ring)");
    expect(shadcnButton).toContain("tw:rounded-[var(--radius-control)]");
    expect(shadcnButton).toContain("tw:duration-[var(--motion-fast)]");
    expect(shadcnButton).toContain('ghost:\n          "tw:bg-transparent');
    expect(shadcnSources.find(([name]) => name === "field.tsx")?.[1]).toContain("tw:border-0 tw:p-0");
    expect(shadcnDialog).toContain("<DialogViewport>");
    expect(shadcnDialog).toContain("tw:flex tw:items-center tw:justify-center");
    expect(appCss).toMatch(/\.custom-select-trigger\s*\{[\s\S]*?min-height:\s*var\(--control-height\)/);
    expect(appCss).toMatch(/\.exp-search\s*\{[\s\S]*?min-height:\s*var\(--control-height\)/);
  });

  it("Quick Ask réserve les marges du textarea dans sa largeur", () => {
    expect(appCss).toMatch(/\.qa-input\s*\{[^}]*width:\s*calc\(100% - 32px\)/);
    expect(appCss).toMatch(/\.qa-input\s*\{[^}]*box-sizing:\s*border-box/);
  });

  it("le textarea du composer peut réellement grandir sans être comprimé par flex", () => {
    expect(appCss).toMatch(/\.ta-wrap textarea\s*\{[^}]*flex:\s*none;/s);
  });

  it("modifier un message conserve exactement sa typographie de bulle", () => {
    expect(appCss).toMatch(/\.user-bubble\s*\{[^}]*font-size:\s*var\(--chat-fs, var\(--fs-xl\)\)/s);
    expect(appCss).toMatch(/\.user-bubble\s*\{[^}]*line-height:\s*1\.55/s);
    expect(appCss).toMatch(/\.edit-message-textarea\s*\{[^}]*font-size:\s*var\(--chat-fs, var\(--fs-xl\)\)/s);
    expect(appCss).toMatch(/\.edit-message-textarea\s*\{[^}]*font-weight:\s*inherit/s);
    expect(appCss).toMatch(/\.edit-message-textarea\s*\{[^}]*letter-spacing:\s*inherit/s);
    expect(appCss).toMatch(/\.edit-message-textarea\s*\{[^}]*line-height:\s*1\.55/s);
  });

  it("le bouton de fermeture Mermaid reste transparent dans tous ses états", () => {
    expect(appCss).toMatch(/\.mermaid-fullscreen-close\s*\{[^}]*background:\s*transparent/s);
    expect(appCss).toMatch(
      /\.mermaid-fullscreen-close:hover,\s*\.mermaid-fullscreen-close:focus-visible\s*\{[^}]*background:\s*transparent/s,
    );
    expect(appCss).toMatch(/\.mermaid-fullscreen-close:focus-visible\s*\{[^}]*outline:\s*none/s);
  });

  it("les tabs Atelier restent compacts et neutres, sans accent de marque", () => {
    expect(appCss).toMatch(/\.sidebar li\.active::before\s*\{[\s\S]*?background:\s*var\(--selection-line\)/);
    expect(primitives).toMatch(/\.ui-tab\s*\{[\s\S]*?height:\s*28px/);
    expect(primitives).toMatch(/\.ui-tab\.is-active::after\s*\{[\s\S]*?background:\s*var\(--border-strong\)/);
    expect(primitives).not.toMatch(/\.ui-tab\.is-active[^}]*var\(--selection-line\)/);
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
    expect(primitives).toMatch(/\.ui-tab-close\s*\{[^}]*opacity:\s*\.42/);
    expect(primitives).toMatch(/\.ui-tab:hover \.ui-tab-close,[\s\S]*?opacity:\s*\.86/);
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
});
