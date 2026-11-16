import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

// Contrat : en mode embarqué (galerie chargée dans l'app), le thème appartient
// à l'hôte (postMessage 'atelier-theme'). Le catalogue local THEMES ne doit
// jamais s'appliquer sur ce chemin — sinon flash d'une palette étrangère au
// chargement, puis désync au premier clic dans le menu Réglages.
const galleryTemplate = fs.readFileSync(
  new URL("../../assets/gallery_template.html", import.meta.url),
  "utf8",
);

test("le choix du thème initial est gardé par la condition embarquée (EMB), jamais un accès figTheme inconditionnel", () => {
  const m = galleryTemplate.match(/let theme = ([^;]+);/);
  assert.ok(m, "déclaration de `theme` introuvable");
  assert.match(m[1], /EMB/, "la lecture initiale de `theme` doit dépendre de EMB");
  assert.match(m[1], /localStorage\.getItem\('figTheme'\)/, "le chemin standalone doit garder figTheme");
});

test("applyTheme n'écrit jamais figTheme en mode embarqué", () => {
  const m = galleryTemplate.match(/function applyTheme\(name\s*\)\{[\s\S]*?\n\}/);
  assert.ok(m, "fonction applyTheme introuvable");
  assert.match(m[0], /if\(!EMB\)\{[^]*?localStorage\.setItem\('figTheme'/, "l'écriture figTheme doit être gardée par !EMB");
});

test("le menu Réglages n'affiche pas la section Theme en mode embarqué", () => {
  const m = galleryTemplate.match(/function buildViewMenu\(\)\{[\s\S]*?\n\}/);
  assert.ok(m, "fonction buildViewMenu introuvable");
  assert.match(m[0], /EMB\s*\?\s*''\s*:/, "la section Theme doit être court-circuitée par EMB");
});

test("THEMES.Default == jetons canoniques d'App.css", () => {
  const m = galleryTemplate.match(/'Default':\s*\{([^}]+)\}/);
  assert.ok(m, "entrée THEMES.Default introuvable");
  const body = m[1];
  const get = (k: string) => {
    const mm = body.match(new RegExp(`${k}:'([^']+)'`));
    return mm && mm[1];
  };
  assert.equal(get("bg"), "#1e2124");
  assert.equal(get("card"), "#24282d");
  assert.equal(get("card2"), "#2c2f34");
  assert.equal(get("txt"), "#dadee3");
  assert.equal(get("muted"), "#90969d");
  assert.equal(get("accent"), "#e77f3e");
  assert.equal(get("border"), "#2a2d31");
});

test("--border du :root racine == jeton canonique #2a2d31", () => {
  const m = galleryTemplate.match(/:root\{[^}]*--border:(#[0-9a-f]{6})/i);
  assert.ok(m, "--border introuvable dans le :root du template");
  assert.equal(m[1].toLowerCase(), "#2a2d31");
});

test("--border du bloc de style injecté en mode embarqué == jeton canonique #2a2d31", () => {
  const m = galleryTemplate.match(/ANNOT_EMBEDDED\)\{[\s\S]*?st\.textContent=[\s\S]*?--border:(#[0-9a-f]{6})/i);
  assert.ok(m, "--border introuvable dans le style injecté ANNOT_EMBEDDED");
  assert.equal(m[1].toLowerCase(), "#2a2d31");
});

test("EMB est déclaré avant le premier appel à applyTheme (ordre de dépendance)", () => {
  const embIdx = galleryTemplate.search(/const EMB\s*=/);
  const applyCallIdx = galleryTemplate.search(/\napplyTheme\(theme\);/);
  assert.ok(embIdx >= 0, "déclaration de EMB introuvable");
  assert.ok(applyCallIdx >= 0, "appel applyTheme(theme) introuvable");
  assert.ok(embIdx < applyCallIdx, "EMB doit être déclaré avant l'appel initial à applyTheme");
});

// ---- Menus (spec 2026-09-06 : modèle canonique de l'app) -------------------

test("--elev et --hot sont déclarés au :root racine", () => {
  const rootBlock = galleryTemplate.match(/:root\{[\s\S]*?\}/);
  assert.ok(rootBlock, ":root racine introuvable");
  assert.match(rootBlock[0], /--elev:/, "--elev absent du :root racine");
  assert.match(rootBlock[0], /--hot:#e06c75/, "--hot absent ou différent du :root racine");
});

test("--elev et --hot sont reportés dans le style injecté en mode embarqué", () => {
  const m = galleryTemplate.match(/ANNOT_EMBEDDED\)\{[\s\S]*?st\.textContent=[\s\S]*?--hot:#e06c75/);
  assert.ok(m, "bloc de style injecté ANNOT_EMBEDDED introuvable");
  assert.match(m[0], /--elev:/, "--elev absent du style injecté ANNOT_EMBEDDED");
  assert.match(m[0], /--hot:#e06c75/, "--hot absent ou différent du style injecté ANNOT_EMBEDDED");
});

test(".menu (carte « … ») : sans bordure, ombre = jeton --elev, survol = --card2", () => {
  const rule = galleryTemplate.match(/\n {2}\.menu\{([^}]*)\}/);
  assert.ok(rule, "règle .menu introuvable");
  assert.doesNotMatch(rule[1], /\bborder:/, ".menu ne doit plus poser de bordure");
  assert.match(rule[1], /border-radius:10px/, ".menu doit garder son rayon de conteneur (10px)");
  assert.match(rule[1], /box-shadow:var\(--elev\)/, ".menu doit utiliser box-shadow:var(--elev)");
  // Le combiné `.menu,.csel-menu{...--shadow-float...}` (plan 023) est réécrit
  // par une règle .menu{box-shadow:var(--elev)} qui vient APRÈS lui dans la
  // cascade — sinon --shadow-float gagnerait silencieusement à l'exécution.
  const floatIdx = galleryTemplate.indexOf("box-shadow:var(--shadow-float)");
  const elevOverrideIdx = galleryTemplate.indexOf(".menu{box-shadow:var(--elev)}");
  assert.ok(floatIdx >= 0 && elevOverrideIdx > floatIdx,
    "la réécriture .menu{box-shadow:var(--elev)} doit suivre le combiné .menu,.csel-menu à --shadow-float");
  assert.match(galleryTemplate, /\.menu \.mi:hover\{background:var\(--card2\)\}/,
    "le survol final de .menu .mi doit être var(--card2) (dernière déclaration de la cascade)");
});

test(".menu .mi.clr (destructif) utilise le jeton --hot, jamais un hex littéral", () => {
  assert.match(galleryTemplate, /\.menu \.mi\.clr\{color:var\(--hot\)\}/);
});

test("#tgMenu : fond --card, sans bordure, ombre --elev, rangées à rayon 6, actif = --primary", () => {
  const inlineDiv = galleryTemplate.match(/<div id="tgMenu" style="([^"]*)">/);
  assert.ok(inlineDiv, 'balise <div id="tgMenu"> introuvable');
  assert.match(inlineDiv[1], /background:var\(--card\)/, "#tgMenu doit avoir background:var(--card)");
  assert.doesNotMatch(inlineDiv[1], /\bborder:/, "#tgMenu ne doit plus poser de bordure");
  assert.match(inlineDiv[1], /box-shadow:var\(--elev\)/, "#tgMenu doit utiliser box-shadow:var(--elev)");

  const itRule = galleryTemplate.match(/#tgMenu \.it\{([^}]*)\}/);
  assert.ok(itRule, "règle #tgMenu .it introuvable");
  assert.match(itRule[1], /border-radius:6px/, "#tgMenu .it doit avoir un rayon de rangée de 6px");

  assert.match(galleryTemplate, /#tgMenu \.it:hover\{background:var\(--card2\)\}/);
  assert.match(galleryTemplate, /#tgMenu \.it\.on \.t\{color:var\(--primary\)\}/,
    "l'état actif de #tgMenu doit être l'accent var(--primary), jamais un bleu à part");
});

test("envoi des notes de figure : aucun glyphe emoji/texte, libellé textuel et icônes d'état en SVG monochromes", () => {
  assert.doesNotMatch(galleryTemplate, /&#128172;/, "l'emoji bulle de commentaire (&#128172;) ne doit plus apparaître");
  assert.doesNotMatch(galleryTemplate, /&#9678;/, "le glyphe cible (&#9678;) ne doit plus apparaître");
  assert.doesNotMatch(galleryTemplate, /&#8593;/, "le glyphe flèche d'envoi (&#8593;) ne doit plus apparaître");
  assert.doesNotMatch(galleryTemplate, /id="annotPill/, "la pilule flottante a cédé la place au panneau Notes");

  // Lot 2 (2026-11-16) : « Envoyer à l'agent ⌘↵ » au pied du panneau Notes.
  // Libellé textuel (Button = action textuelle), états d'envoi = <svg> inline.
  const send = galleryTemplate.match(/<button type="button" id="annotSendAll"[\s\S]*?<\/button>/);
  assert.ok(send, "balisage #annotSendAll introuvable");
  assert.match(send[0], /<span class="lbl">Envoyer à l’agent<\/span><kbd>⌘↵<\/kbd><svg class="ic-ok"/, "envoi = libellé + raccourci + coche SVG");
  assert.match(send[0], /<svg class="ic-err"/);
  const more = galleryTemplate.match(/<button type="button" id="annotSendMore"[\s\S]*?<\/button>/);
  assert.ok(more && /<svg /.test(more[0]), "le chevron des autres envois doit être un <svg> inline");
  const single = galleryTemplate.match(/<button type="button" class="annot-send"[\s\S]*?<\/button>/);
  assert.ok(single && /<svg [\s\S]*<span>Envoyer au chat<\/span>/.test(single[0]), "« Envoyer au chat » = bulle SVG + libellé");
  for (const glyph of ["◎", "↑", "×", "\\23F3", "\\2713"]) assert.ok(![send[0], more[0], single[0]].some((markup) => markup.includes(glyph)), `glyphe interdit : ${glyph}`);
  const toolbarCss = fs.readFileSync(new URL("../../assets/gallery_viewer_toolbar.css", import.meta.url), "utf8");
  assert.doesNotMatch(toolbarCss, /annotSendAll\.is-(ok|err)[^{]*::after/, "les états d'envoi passent par des SVG, pas par des glyphes ::after");
  assert.match(toolbarCss, /#annotSendAll\.is-ok \.ic-ok\{display:block\}/);
  assert.match(toolbarCss, /#annotSendAll\.is-err \.ic-err\{display:block;color:var\(--hot\)\}/);
  // Bouton neutre : ni fond d'accent, ni blanc.
  const rule = toolbarCss.match(/#lb\.responsive-viewer #annotSendAll,#lb\.responsive-viewer #annotSendMore\{[^}]*\}/);
  assert.ok(rule, "règle du bouton d'envoi introuvable");
  assert.match(rule[0], /background:color-mix\(in srgb,var\(--txt\) 9%,transparent\);color:var\(--txt\)/);
  assert.doesNotMatch(rule[0], /--primary|--accent|#fff/);
});

test("annotSendAll : l'état d'envoi passe par des classes is-busy/is-ok/is-err, jamais par un remplacement de textContent du bouton", () => {
  const handler = galleryTemplate.match(/annotSendAll=async\(direct\s*\)=>\{[\s\S]*?\n  \};/);
  assert.ok(handler, "fonction annotSendAll introuvable");
  assert.doesNotMatch(handler[0], /button\.textContent\s*=/, "l'envoi ne doit pas réécrire le libellé du bouton");
  assert.match(handler[0], /classList\.add\('is-busy'\)/);
  assert.match(handler[0], /classList\.add\('is-ok'\)/);
  assert.match(handler[0], /classList\.add\('is-err'\)/);
  assert.match(handler[0], /classList\.remove\('is-busy','is-ok','is-err'\)/, "le retour à l'état neutre doit retirer les trois classes d'état");
});

test("aucun des hex de menu hérités (#ff9b9b, #8ab4ff, #3a4150) ne subsiste dans le fichier", () => {
  assert.doesNotMatch(galleryTemplate, /#ff9b9b/i);
  assert.doesNotMatch(galleryTemplate, /#8ab4ff/i);
  assert.doesNotMatch(galleryTemplate, /#3a4150/i);
});
