# Plan 066: Une seule fiche d'épingle — fin du débordement dans Preuves et le chat

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. On a
> STOP condition, stop and report — do not improvise. Do NOT update
> `plans/README.md` (the reviewer maintains the index). Do not push.
>
> **Drift check (run first)**: `git diff --stat 1be9aaaa..HEAD -- src/components/EvidenceSurface.tsx src/components/chat/PassageCard.tsx src/App.css src/lib/i18n.ts`
> Si un fichier in-scope a bougé, comparer aux extraits « Current state » avant
> de continuer ; sur divergence, c'est une condition STOP.

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: MED (surface partagée avec une session parallèle)
- **Depends on**: none
- **Category**: bug / ui
- **Planned at**: commit `1be9aaaa`, 2026-08-16

## Why this matters

Deux captures de l'opérateur montrent le même défaut : un titre de source long
se peint **par-dessus** les boutons — dans le panneau Preuves (« Copier la
citation ») et dans la carte de passage du chat (bouton d'épingle). Mesuré sur
un banc reproduisant le CSS réel : **157 px de débordement** dans le panneau,
**120 px** dans la carte. Cause unique, dupliquée dans deux composants : le
méta est en `flex: none` sans `min-width: 0` ni ellipsis — il ne cède jamais et
ne se tronque jamais. Le cas aggravant est réel dans les données de
l'opérateur : une épingle gbrain **sans citation** (`quote` vide, source
« Watson 2018 … ») laisse le méta occuper seul toute la largeur d'un layout qui
suppose toujours citation + méta.

Artefact de design validé par l'opérateur (fiche deux lignes) :
https://claude.ai/code/artifact/116cfd36-01d5-48cc-996b-0760d18329c9

## Current state

**Le bug, deux fois — `src/App.css`** :

```css
/* :3535 — panneau Preuves */
.evidence-row-meta { flex: none; font-size: var(--fs-s); color: var(--text-muted);
  font-variant-numeric: tabular-nums; }
/* :3504 — carte du chat */
.passage-card-meta { flex: none; font-size: var(--fs-s); color: var(--text-muted);
  font-variant-numeric: tabular-nums; }
```

Les rangées actuelles (une seule ligne, citation et méta côte à côte) :

```css
/* :3529-3538 */
.evidence-row { display: flex; align-items: center; gap: 8px; }
.evidence-row-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; ... }
.evidence-row-quote { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; font-style: italic; font-size: var(--fs-l); color: var(--text-primary); }
.evidence-copy { flex: none; color: var(--text-muted); }
.evidence-unpin { flex: none; color: var(--accent); }
```

**`src/components/EvidenceSurface.tsx:78-104`** — `EvidenceRow` :

```tsx
const meta = isGbrain ? pin.citeLabel : `${pin.citeLabel} · p. ${pin.page}`;
return (
  <div className="evidence-row">
    <RowButton className="evidence-row-main" onClick={() => openPin(pin)}>
      <span className="evidence-row-quote">{pin.quote}</span>
      <span className="evidence-row-meta">{meta}</span>
    </RowButton>
    <Button variant="ghost" size="sm" className="evidence-copy" onClick={() => copyCitation(pin)}>
      {t(isGbrain ? "preuves.copy-quote" : "preuves.copy-cite")}
    </Button>
    <IconButton className="evidence-unpin" label={t("passage.unpin")} onClick={() => onUnpin(pin)}>
      <PinIcon />
    </IconButton>
  </div>
);
```

**`src/components/chat/PassageCard.tsx:70-91`** — état replié (le seul en scope) :

```tsx
<div className="passage-card">
  <RowButton className="passage-card-row" aria-label={t("passage.expand")} onClick={() => setOpen(true)}>
    <span className="passage-card-quote">{refData.quote}</span>
    <span className="passage-card-meta">{isGbrain ? label : `${label} · p. ${refData.page}`}</span>
    <Tick open={false} />
  </RowButton>
  <IconButton className={pin ? "passage-card-pin is-pinned" : "passage-card-pin"} ... >
    <PinIcon />
  </IconButton>
</div>
```

**Conventions du projet à respecter (CLAUDE.md, contraignantes)** :
- tailles de texte 10/11/12/13/15 uniquement (`--fs-xs`…`--fs-xl`) ; poids 400/500/600 ;
  rayons 6/10/999 ; espacement multiple de 4 ; transitions 120–150 ms.
- **jamais de `<button>` nu** hors `src/components/ui/` — utiliser `Button`,
  `IconButton`, `RowButton` (verrouillé par `css-contract.test.ts`).
- toute couleur via variables CSS ; 4 niveaux de gris de texte seulement.
- i18n : toute chaîne visible via `t()`, **parité fr/en obligatoire** dans
  `src/lib/i18n.ts` (les clés `preuves.copy-cite`, `preuves.copy-quote`,
  `passage.unpin`, `passage.pin` existent déjà).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 (ignorer `src/test_auto_review*`) |
| Tests ciblés | `npx vitest run src/components/EvidenceSurface.test.tsx src/components/chat/PassageCard.test.tsx` | verts |
| Contrat CSS | `npx vitest run src/components/ui/css-contract.test.ts` | 35 verts |
| Build | `npx vite build` | exit 0 |

## Scope

**In scope** :
- `src/App.css` (blocs `.evidence-*` et `.passage-card-*`)
- `src/components/EvidenceSurface.tsx` (`EvidenceRow` uniquement)
- `src/components/chat/PassageCard.tsx` (**état replié uniquement**, lignes ~70-91)
- `src/lib/i18n.ts` (une clé nouvelle, fr + en)
- les deux fichiers de test correspondants

**Out of scope** (ne pas toucher) :
- L'état **déplié** de `PassageCard` (`passage-card.open`, `passage-card-quote-full`,
  `passage-card-actions`) — il fonctionne, et une session parallèle vient d'y
  livrer des correctifs (`661e2a70`).
- Le store d'épingles, le contrat WS, `/ref`, `kb_promote` — 100 % Rust, propriété
  de la session parallèle.
- Le regroupement par ancre côté données (`pin.supports`) — l'artefact le montre,
  mais **ce plan ne change que le rendu d'une rangée**. L'en-tête d'ancre
  (bordure accent + indentation) est un lot séparé, à ne PAS faire ici.

## Git workflow

- Branch: `advisor/066-fiche-epingle`
- Commits par étape ; style repo : `fix(preuves): …`, `fix(chat): …`
  (voir `git log --oneline -10`). Ne pas pusher.

## Steps

### Step 1 — La fiche deux lignes dans le panneau Preuves

Dans `App.css`, remplacer le bloc `.evidence-row*` par une fiche verticale :

- `.evidence-row` : `display:flex; align-items:flex-start; gap:8px; padding:8px 10px;
  border-radius:6px;` + `:hover{background:var(--bg-ctl)}`
- `.evidence-row-main` : colonne (`flex-direction:column; gap:4px; flex:1; min-width:0`)
- `.evidence-row-quote` : `font-size:var(--fs-m)` (13px), italique, **clamp 2 lignes**
  (`display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden`),
  `line-height:1.45`, `white-space:normal` (retirer le nowrap)
- **nouveau** `.evidence-row-quote.is-absent` : `font-style:normal; color:var(--text-secondary)`
- `.evidence-row-meta` : `display:flex; align-items:baseline; gap:6px; min-width:0;
  font-size:var(--fs-xs)` (11px) — **retirer `flex:none`**
- **nouveaux** `.evidence-meta-src` (`min-width:0; overflow:hidden; text-overflow:ellipsis;
  white-space:nowrap`), `.evidence-meta-page` (`flex:none; font-variant-numeric:tabular-nums;
  color:var(--text-disabled)`), `.evidence-meta-kind` (pastille 5px `border-radius:999px`,
  `background:var(--text-disabled)`, variante `.is-gbrain{background:var(--accent)}`)
- `.evidence-actions` : `flex:none; display:flex; gap:2px; opacity:0;
  transition:opacity 130ms ease` + `.evidence-row:hover &`, `.evidence-row:focus-within &`
  → `opacity:1`. **Impératif accessibilité** : l'opacité seule ne suffit pas si
  les boutons restent focusables — garder `opacity` (pas `display:none`) pour
  que le focus clavier les révèle via `:focus-within`.

Dans `EvidenceSurface.tsx`, `EvidenceRow` rend :

```tsx
const hasQuote = Boolean(pin.quote?.trim());
// citation absente : le titre prend sa place, en romain — l'italique reste
// réservée aux vraies citations.
<div className="evidence-row">
  <RowButton className="evidence-row-main" onClick={() => openPin(pin)}>
    <span className={hasQuote ? "evidence-row-quote" : "evidence-row-quote is-absent"}>
      {hasQuote ? pin.quote : t("preuves.open-source", { source: pin.citeLabel })}
    </span>
    <span className="evidence-row-meta">
      <span className={isGbrain ? "evidence-meta-kind is-gbrain" : "evidence-meta-kind"} aria-hidden="true" />
      <span className="evidence-meta-src">{pin.citeLabel}</span>
      {!isGbrain && <span className="evidence-meta-page">p. {pin.page}</span>}
    </span>
  </RowButton>
  <span className="evidence-actions">
    <IconButton className="evidence-copy" label={t(isGbrain ? "preuves.copy-quote" : "preuves.copy-cite")} onClick={...}>
      <CopyIcon />
    </IconButton>
    <IconButton className="evidence-unpin" label={t("passage.unpin")} onClick={...}>
      <PinIcon />
    </IconButton>
  </span>
</div>
```

Le bouton texte « Copier la citation » devient un `IconButton` : son ancien
libellé devient le `label` (donc l'`aria-label` + tooltip). Icône : réutiliser
une icône existante du repo si elle existe (chercher `CopyIcon`/`Copy` dans
`src/components/`), sinon SVG monochrome inline stroke 1.45, 14×14, comme
`PinIcon`.

Ajouter dans `src/lib/i18n.ts` (**les deux dictionnaires**) :
`"preuves.open-source"` → fr « {source} — ouvrir la page », en « {source} — open page ».
Si le système d'interpolation de `t()` ne prend pas d'objet, suivre le motif
déjà utilisé dans le fichier (chercher un exemple avec substitution).

**Verify** : `npx tsc --noEmit` exit 0 ; `npx vitest run src/components/ui/css-contract.test.ts` vert.

### Step 2 — La même fiche dans la carte du chat (état replié)

Dans `App.css`, aligner `.passage-card` replié sur le même modèle :
`align-items:flex-start`, `.passage-card-row` en colonne, `.passage-card-quote`
clampée à 3 lignes (la carte est plus large), `.passage-card-meta` **sans
`flex:none`**, avec les mêmes sous-éléments `src`/`page`/`kind` (réutiliser les
classes `.evidence-meta-*` plutôt que d'en créer des jumelles — un seul
vocabulaire pour les deux surfaces).

Dans `PassageCard.tsx`, **état replié uniquement** : même structure que
`EvidenceRow` (citation clampée, méta en dessous, cas `quote` vide géré).
Garder `Tick`, `aria-label={t("passage.expand")}` et le bouton d'épingle
existant avec son `aria-pressed`.

**Verify** : `npx tsc --noEmit` ; `npx vitest run src/components/chat/PassageCard.test.tsx` vert.

### Step 3 — Tests de non-régression

Dans `EvidenceSurface.test.tsx` (suivre le style du fichier existant) :
1. **citation vide** → la rangée rend le libellé de source et porte la classe
   `is-absent` ; aucun texte vide affiché.
2. **libellé long** → le méta porte bien la classe `evidence-meta-src`
   (le débordement réel se voit à l'œil, mais la classe garantit
   `min-width:0`+ellipsis ; ne PAS tenter d'assertion sur `getBoundingClientRect`
   en jsdom, elle renverrait 0).
3. **actions** → deux `IconButton` avec les `aria-label` attendus (copier /
   désépingler), et le clic « copier » appelle toujours le presse-papiers.

Dans `PassageCard.test.tsx` : un test « citation vide ne casse pas la carte
repliée ».

**Verify** : `npx vitest run src/components/EvidenceSurface.test.tsx src/components/chat/PassageCard.test.tsx` — tous verts, N nouveaux tests inclus.

### Step 4 — Vérification finale

`npx tsc --noEmit` + `npx vite build` + la suite front ciblée :
`npx vitest run src/components` (aucune régression ailleurs).

## Test plan

- 4 tests neufs (3 Evidence + 1 PassageCard), modelés sur les fichiers existants.
- Le contrat CSS (`css-contract.test.ts`, 35 tests) doit rester vert : il
  interdit les `<button>` nus et les noms de variables héritées.

## Done criteria

- [ ] `grep -n "flex: none" src/App.css | grep -E "evidence-row-meta|passage-card-meta"` → **aucun résultat**
- [ ] `npx tsc --noEmit` exit 0 ; `npx vite build` exit 0
- [ ] `npx vitest run src/components` vert, 4 tests neufs inclus
- [ ] `css-contract.test.ts` 35/35
- [ ] i18n : `preuves.open-source` présent dans les DEUX dictionnaires
- [ ] Aucun fichier hors scope modifié (`git status`)
- [ ] État **déplié** de `PassageCard` inchangé (`git diff` ne touche pas
      `passage-card-quote-full` / `passage-card-actions`)

## STOP conditions

- Drift : les extraits « Current state » ne correspondent plus (la session
  parallèle a retouché ces composants) → STOP, rapporter le diff observé.
- `t()` n'accepte pas de substitution et aucun motif équivalent n'existe dans
  le fichier → STOP, proposer la forme retenue plutôt que d'inventer.
- Le contrat CSS casse à cause d'une valeur hors système → STOP (ne pas
  désactiver le test).

## Maintenance notes

- Après ce plan, `.evidence-meta-*` est le vocabulaire commun des deux surfaces :
  toute nouvelle surface affichant une épingle doit le réutiliser, pas le cloner.
  C'est précisément la duplication qui a produit ce bug en double.
- L'en-tête d'ancre (bordure accent + indentation des preuves d'un même groupe,
  visible dans l'artefact) reste à faire : lot séparé, à coordonner avec la
  session propriétaire de la surface Preuves.
