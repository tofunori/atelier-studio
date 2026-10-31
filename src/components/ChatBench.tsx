// ChatBench (plan 020) — banc de captures DÉTERMINISTES du fil de chat et du
// composer. Monté par main.tsx sur #chatbench[-état][-light] ; jamais dans le
// parcours normal (chunk lazy). Rend le VRAI composant Chat avec des fixtures
// figées : aucun sidecar requis.
// États : rich (défaut) · running · stream · activityparity · slottransition · thinking · agents · error · contexts · markdown · typeset · cli · actionsclaude · actionscodex · claudeagents · finagents.
import { useEffect, useRef, useState } from "react";
import "../styles/tokens.css";
import "../styles/typeset.css";
import "../styles/primitives.css";
import "../App.css";
import { Button } from "./ui";
import Chat from "./Chat";
import { CONSIGNES_LIVREES, basculerConsigne, type ConsigneDuFil } from "../lib/consignes";
import { choisirSpecialiste, type Specialiste } from "../lib/specialistes";
import type { AgentEvent } from "../lib/ws";
import type { ProviderInfo } from "../lib/providers";
import type { QueuedTurn } from "../lib/chatDraftStore";
import { reduceHarnessEvents, materializeHarnessHistory } from "../lib/harnessEvents";
import { codexComposite, codexObservedLive, claudeObservedLive } from "../lib/chat/streamReplayFixtures";

const NOW = Date.now();
const BENCH_PINS = [{ index: 6, label: "Validation W&M reproduite", anchor: "La validation reproduit" }];
const ts = (offsetS: number) => NOW - offsetS * 1000;
const noop = () => {};

const PROVIDERS: ProviderInfo[] = [
  {
    id: "claude", label: "Claude Code", kind: "cli", version: "2.1.0", ok: true,
    models: ["claude-fable-5", "claude-sonnet-5"], defaultModel: "claude-fable-5",
    // échelle réelle de claude.rs, ultracode compris : le banc doit montrer le
    // cran terminal détaché, pas une échelle raccourcie
    efforts: ["low", "medium", "high", "xhigh", "max", "ultracode"],
    capabilities: {
      resume: true, steering: true, queue: true, goals: false, tools: true,
      toolOutput: true, permissions: true,
      permissionModes: ["default", "acceptEdits", "plan", "bypassPermissions"],
    },
  },
  {
    id: "codex", label: "Codex", kind: "cli", version: "0.142.5", ok: true,
    models: ["gpt-5.5"], defaultModel: "gpt-5.5", efforts: ["low", "medium", "high"],
    capabilities: { resume: true, steering: true, queue: true, goals: true, tools: true, toolOutput: true, permissions: true, permissionModes: ["default"] },
  },
];

function tool(id: string, name: string, detail: string, output: string, dur: number, offsetS: number): AgentEvent {
  return {
    kind: "tool_update", id, name, detail, output, status: "completed",
    input: { file_path: detail }, source: null, durationMs: dur, ts: ts(offsetS),
  } as AgentEvent;
}

const RICH: AgentEvent[] = [
  { kind: "user", text: "Reproduis la validation Williamson & Menounos sur les régions RGI ouest, puis mets à jour la figure 3.", ts: ts(400), label: "albedo_trends.csv · fig3_spatial.svg" } as AgentEvent,
  // figure annotée depuis la galerie (2026-09-04) : vignette 56 px + badges
  { kind: "user", text: "", ts: ts(398), label: "fig3_regional_years.png",
    imageUrl: "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#2c2f34"/><path d="M14 92 40 70 62 78 90 44 108 52" fill="none" stroke="#b9bec4" stroke-width="4"/><circle cx="62" cy="78" r="12" fill="#dadee3"/><text x="62" y="83" text-anchor="middle" font-size="14" font-family="sans-serif" fill="#1e2124">1</text></svg>'),
    notes: [
      { n: 1, text: "déplacer la carte — elle recouvre le creux de 2012" },
      { n: 2, text: "l'axe des années déborde, garder une étiquette sur deux" },
    ] } as AgentEvent,
  { kind: "thinking", text: "Je dois d'abord relire la méthodologie de W&M 2021, vérifier les seuils par région, puis recalculer les tendances avant de régénérer la figure.", ts: ts(395) } as AgentEvent,
  tool("t1", "Read", "analysis/albedo_trends.py", "240 lignes", 900, 390),
  tool("t2", "Bash", "python analysis/albedo_trends.py --regions west", "Tendance moyenne : −0,35 %/an (vs −0,33 attendu)", 8200, 380),
  tool("t3", "Edit", "manuscrit/fig3_spatial.svg", "Figure régénérée", 1400, 370),
  { kind: "edit", projectRoot: "/tmp/bench", files: [{ path: "manuscrit/fig3_spatial.svg", add: 12, del: 4 }], ts: ts(365) } as AgentEvent,
  {
    kind: "text",
    text: "La validation reproduit le résultat de Williamson & Menounos : **−0,35 %/an** sur les régions ouest (écart +0,02 attribuable au masque de neige transitoire).\n\n| Région | Tendance | n |\n|---|---|---|\n| Coast | −0,41 | 214 |\n| Rockies | −0,29 | 187 |\n\nLa figure 3 a été régénérée avec les nouvelles pentes.",
    ts: ts(360),
  } as AgentEvent,
  {
    kind: "done", ok: true, result: "Validation terminée.", projectRoot: "/tmp/bench",
    filesChanged: ["manuscrit/fig3_spatial.svg", "analysis/albedo_trends.py"],
    usage: { context: 84200, output: 8120, cost: 0.42, turns: 3 }, ts: ts(355),
  } as AgentEvent,
];

const RUNNING: AgentEvent[] = [
  { kind: "user", text: "Analyse la tendance d'albédo 2000–2025 sur les 11 régions.", ts: ts(272) } as AgentEvent,
  { kind: "started", ts: ts(271) } as AgentEvent,
  {
    kind: "tool_update", id: "r1", name: "Bash", detail: "python analysis/albedo_trends.py --all",
    output: "", status: "running", input: {}, source: null, ts: ts(180),
  } as AgentEvent,
  { kind: "streaming", text: "Je lance le calcul des tendances par région. Les premières valeurs pour Coast et Rockies sont cohérentes avec…", ts: ts(10) } as AgentEvent,
];

const THINKING: AgentEvent[] = [
  { kind: "user", text: "Analyse les données locales et prépare une réponse.", ts: ts(20) } as AgentEvent,
  { kind: "started", ts: ts(19) } as AgentEvent,
  { kind: "tool", name: "__thinking" } as AgentEvent,
];

// Pensée vivante LONGUE : fenêtre 4 lignes + « tout afficher » + repli.
const LONG_THINKING: AgentEvent[] = [
  { kind: "user", text: "Vérifie la cohérence des surfaces RGI.", ts: ts(60) } as AgentEvent,
  { kind: "started", ts: ts(59) } as AgentEvent,
  tool("lt-read", "Read", "gee_pipeline/config.py", "RGI_REGIONS…", 640, 55),
  {
    kind: "thinking_live",
    ts: ts(5),
    text: [
      "Points à vérifier avant de répondre :",
      "",
      "11. Residual scales 0.033/0.027/0.021 disjoint — les commentaires du script disent 0.0321/0.0271/0.0216 ✓ cohérent (arrondi).",
      "12. **\"regions 01 and 02 ... and their 11 subregions\"** : affirme que RGI v7 définit exactement 11 sous-régions — à confirmer contre `RGI_REGIONS`.",
      "13. Divergences 2 190 centré contre 0 non-centré — plausible d'après les essais prior_tau ; invérifiable rapidement sans le fichier.",
      "14. ESS 1362/2227, BFMI 0.736–0.788 — viennent du fit ; l'idata nc existe (`bayes_REGION_c_idata.nc`), on pourrait charger et vérifier.",
      "",
      "- Magnus formula",
      "- ERA5-Land 0.1° nearest cell",
    ].join("\n"),
  } as AgentEvent,
];

// Réponse « façon Hermes » (fournie par Thierry 2026-08-21) : pensée longue
// structurée puis réponse à titres + tableau + listes + code inline.
const HERMES_REPLY: AgentEvent[] = [
  { kind: "user", text: "ouin et sinon le reste est bon?", ts: ts(220), label: "methods_en.tex" } as AgentEvent,
  { kind: "thinking", text: "The user asks: « ouin et sinon le reste est bon? » — apart from what I found (Downscaled meteorological variables, the model equation, 02_05), is the REST of the methods section good?\n\nSo they want an assessment of the remaining parts of the Methods section I haven't covered in detail:\n\n- Study area and glacier surface (S2 dynamic mask)\n- MODIS albedo retrieval (Ren et al. 2021, screening, BRDF, N2B conversion)\n- Priors (checked — matches script)\n- Model checking (checked — 71.3 p_loo, 3 obs k>0.7, psense 0.058 vs 0.053 flagged)\n\nWhat can I verify quickly to say « the rest is good » responsibly?\n\n11. Residual scales 0.033/0.027/0.021 disjoint — the script comments say 0.0321/0.0271/0.0216 ✓ consistent (rounded).\n12. **\"gains 18.8 elpd\"** — flagged already (19.9 in gaussian era comments; need Student-era number).\n13. Divergences 2,190 centered vs 0 non-centered — plausible from prior_tau experiments; can't verify quickly unless a file exists.\n14. ESS numbers 1362/2227, BFMI 0.736–0.788 — from the fit; the idata nc exists (`bayes_REGION_c_idata.nc`) — could load and verify with `az.summary`.\n\nLet me run batch 1 now.", ts: ts(215) } as AgentEvent,
  tool("hr-1", "Read", "gee_pipeline/config.py", "RATIO_THRESHOLD…", 480, 200),
  tool("hr-2", "Bash", "rg -n \'NDSI|Liang|Stroeve\' gee_pipeline", "7 correspondances", 1200, 190),
  { kind: "text", text: "Bonne question — je vérifie le reste avec la même rigueur, par lots : les paramètres du masque S2 et de l\'albédo MODIS contre le code GEE, et les chiffres statistiques restants contre tes sorties.", ts: ts(180) } as AgentEvent,
  tool("hr-3", "Bash", "python -c \'import arviz\'", "ESS bulk min 1362", 9400, 120),
  { kind: "text", text: "## Vérifié exact, chiffre par chiffre ✓\n\n| énoncé | vérification |\n|---|---|\n| ratio B4/B11 > 2.0 (Bolch), NDWI ≥ 0.45 | `gee_pipeline/config.py` : `RATIO_THRESHOLD: 2.0`, `NDWI_THRESHOLD: 0.45` — exact |\n| NDSI > 0.4 neige/glace | `DEFAULT_REN_NDSI_THRESHOLD = 0.4` — exact |\n| albédo moyen 0,478, étendue 0,292–0,631 | recalculé sur le panel : identique aux décimales |\n| « 6 of 30 cells return a positive fire slope » | recompté sur les OLS par cellule : exactement 6/30 |\n\n## Drapeaux restants\n\n1. **EC+POM vs EC+POM+SOM** — la section dit « EC+POM+SOM, dry only » ; `fire_deposition_timing.py` définit le composite comme EC+POM. C'est la définition du traitement.\n2. **Poids médian de rétrécissement 0,13** — introuvable ; la colonne de `pentes_regionales_retrecissement.csv` contient des valeurs impossibles sous *w = τ²/(τ²+SE²)*.\n3. **« 450 elpd » / « 43 elpd »** — dans aucun CSV ouvert du carnet.\n\n## Recommandation finale\n\nConformément à tes invariants (#2 et #4) : avant soumission, une passe de **Source Map** sur la Methods — chaque nombre → fichier artefact + SHA. Ce que j'ai pu tracer est juste, donc la section est écrite sur des données réelles, pas décorée.", ts: ts(60) } as AgentEvent,
  {
    kind: "done", ok: true, result: "Vérification terminée.", projectRoot: "/tmp/bench",
    filesChanged: [], usage: { context: 96000, output: 4200, cost: 0.31, turns: 1 }, ts: ts(55),
  } as AgentEvent,
];

// Ordre du tour : la pensée PRÉCÈDE la réponse qu'elle a servi à écrire —
// elle se lit donc au-dessus (Thierry 2026-08-21, comparaison Hermes).
const THINKING_ORDER: AgentEvent[] = [
  { kind: "user", text: "quest ce que tu penses tu reste?", ts: ts(30) } as AgentEvent,
  {
    kind: "thinking_live",
    ts: ts(26),
    text: [
      "The user asks \"quest ce que tu penses tu reste?\" — a bit ambiguous.",
      "I think they're asking what I think remains (from the corrections list).",
      "Let me give a concise prioritized view of what's left and my recommendation.",
    ].join("\n"),
  } as AgentEvent,
  {
    kind: "streaming",
    ts: ts(4),
    text: "Mon avis sur ce qui reste, par ordre de ce qui compte vraiment :\n\n**À faire avant toute autre chose — A1, le bug `\\cite`.** C'est le seul défaut qui peut casser la compilation.\n\n**Ensuite, C3 et C5 — les deux « gratuits ».**",
  } as AgentEvent,
];

// Cas signalé par Thierry (2026-08-21) : cinq lectures d'affilée = UNE ligne
// déposée. Aucun cumul ne doit s'afficher au-dessus, il la répéterait.
const CINQ_LECTURES: AgentEvent[] = [
  { kind: "user", text: "Relis la section méthode.", ts: ts(110) } as AgentEvent,
  tool("cl-1", "Read", "manuscrit/methods_en.tex", "420 lignes", 380, 100),
  tool("cl-2", "Read", "gee_pipeline/config.py", "RGI_REGIONS", 240, 95),
  tool("cl-3", "Read", "analysis/albedo_trends.py", "240 lignes", 310, 90),
  tool("cl-4", "Read", "docs/DATA_CHANGELOG.md", "88 lignes", 150, 85),
  tool("cl-5", "Read", "manuscrit/refs.bib", "1200 lignes", 520, 80),
  { kind: "tool", name: "__thinking" } as AgentEvent,
];

const STREAM: AgentEvent[] = [
  { kind: "user", text: "Inspecte puis corrige le composer.", ts: ts(30) } as AgentEvent,
  { kind: "text", text: "Je commence par lire les composants concernés.", ts: ts(28) } as AgentEvent,
  tool("stream-read", "Read", "src/components/Chat.tsx", "Lecture terminée", 420, 26),
  tool("stream-test", "Bash", "npx vitest run src/components/chat", "38 tests verts", 2100, 24),
  { kind: "text", text: "Le premier contrôle passe. Je vérifie maintenant la présentation active.", ts: ts(20) } as AgentEvent,
  {
    kind: "tool_update", id: "stream-search", name: "Bash", detail: "rg -n active-turn src",
    output: "", status: "running", input: {}, source: null, ts: ts(4),
  } as AgentEvent,
];

const ACTIVITY_PARITY: AgentEvent[] = [
  { kind: "user", text: "Lis le composant puis génère une visualisation de contrôle.", ts: ts(36) } as AgentEvent,
  { kind: "text", text: "Je vérifie d’abord l’état réel du composant et ses tests.", ts: ts(34) } as AgentEvent,
  {
    kind: "tool_update", id: "parity-read", name: "Bash", detail: "pwd && sed -n '1,160p' src/components/Chat.tsx",
    output: "", status: "completed", source: "codex", ts: ts(31),
    input: {
      command: "pwd && sed -n '1,160p' src/components/Chat.tsx",
      commandActions: [
        { type: "unknown", command: "pwd" },
        { type: "read", command: "sed -n '1,160p' src/components/Chat.tsx", name: "Chat.tsx", path: "/repo/src/components/Chat.tsx" },
      ],
    },
  } as AgentEvent,
  { kind: "text", text: "La lecture confirme le chemin de rendu. Je produis maintenant l’aperçu demandé.", ts: ts(25) } as AgentEvent,
  {
    kind: "tool_update", id: "parity-image", name: "image_generation", detail: "Scientific activity timeline",
    output: "", status: "inProgress", source: "codex", ts: ts(4),
    input: { revisedPrompt: "Scientific activity timeline" },
  } as AgentEvent,
  { kind: "thinking_live", text: "Je prépare aussi le libellé final.", ts: ts(2) } as AgentEvent,
];

const SLOT_TRANSITION: AgentEvent[] = [
  { kind: "user", text: "Lis le composant puis poursuis l’analyse.", ts: ts(24) } as AgentEvent,
  { kind: "text", text: "Je vérifie le composant concerné.", ts: ts(22) } as AgentEvent,
  {
    kind: "tool_update", id: "slot-read", name: "Read", detail: "src/components/Chat.tsx",
    output: "", status: "completed", source: "codex", ts: ts(8),
    input: { file_path: "src/components/Chat.tsx" },
  } as AgentEvent,
  { kind: "tool", name: "__thinking" } as AgentEvent,
];

const IMAGE_VIEW: AgentEvent[] = [
  { kind: "user", text: "Inspecte cette capture.", ts: ts(20) } as AgentEvent,
  {
    kind: "tool_update", id: "image-1", name: "view_image", output: "", status: "completed",
    input: {
      paths: ["data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='160' viewBox='0 0 240 160'%3E%3Crect width='240' height='160' fill='%23282b31'/%3E%3Crect x='18' y='18' width='204' height='124' rx='10' fill='%23373b43' stroke='%238b929f'/%3E%3Ccircle cx='70' cy='62' r='15' fill='%23aeb6c4'/%3E%3Cpath d='M34 124l48-42 34 28 28-24 62 38' fill='none' stroke='%23d5d9e0' stroke-width='8'/%3E%3C/svg%3E"],
    },
    source: "codex", ts: ts(10),
  } as AgentEvent,
];

const AGENTS: AgentEvent[] = [
  { kind: "user", text: "/recherche Trouve les meilleures pratiques pour nos figures scientifiques.", ts: ts(32) } as AgentEvent,
  { kind: "text", text: "Je sépare la recherche éditoriale, la télédétection et la pile Python, puis je recoupe les résultats.", ts: ts(30) } as AgentEvent,
  {
    kind: "tool_update", id: "spawn-editorial", name: "agent:spawnAgent", output: "", status: "completed", source: "codex",
    agentActivity: { tool: "spawnAgent", receiverThreadIds: ["agent-editorial"], agentsStates: { "agent-editorial": { status: "running", message: null } }, prompt: "Review editorial figure guidelines", model: "gpt-5.6-codex", reasoningEffort: "high" },
    ts: ts(28),
  } as AgentEvent,
  {
    kind: "tool_update", id: "activity-editorial", name: "agent:activity", output: "", status: "inProgress", source: "codex",
    agentActivity: { tool: "activity", receiverThreadIds: ["agent-editorial"], agentsStates: { "agent-editorial": { status: "running", message: null } }, agentThreadId: "agent-editorial", agentPath: "/root/editorial", activityKind: "started" },
    ts: ts(27),
  } as AgentEvent,
  {
    kind: "tool_update", id: "spawn-remote", name: "agent:spawnAgent", output: "", status: "completed", source: "codex",
    agentActivity: { tool: "spawnAgent", receiverThreadIds: ["agent-remote"], agentsStates: { "agent-remote": { status: "running", message: null } }, prompt: "Review remote sensing figure design", model: "gpt-5.6-codex", reasoningEffort: "high" },
    ts: ts(26),
  } as AgentEvent,
  {
    kind: "tool_update", id: "activity-remote", name: "agent:activity", output: "", status: "inProgress", source: "codex",
    agentActivity: { tool: "activity", receiverThreadIds: ["agent-remote"], agentsStates: { "agent-remote": { status: "running", message: null } }, agentThreadId: "agent-remote", agentPath: "/root/remote_sensing", activityKind: "started" },
    ts: ts(25),
  } as AgentEvent,
  { kind: "tool", name: "__thinking" } as AgentEvent,
];

// Événements du CLI claude rendus comme dans le terminal : avis de hook en
// échec, liste de tâches (TaskCreate/TaskUpdate) en checklist, sous-agent
// Claude dont la rangée montre ce qu'il fait, mémoire enregistrée.
const CLI_EVENTS: AgentEvent[] = [
  { kind: "user", text: "Mets à jour la figure 4 et vérifie les unités.", ts: ts(40) } as AgentEvent,
  { kind: "todos", items: [
    { text: "Régénérer la figure 4", completed: true },
    { text: "Vérifier les unités de la table S2", completed: false, active: true },
    { text: "Relire la légende", completed: false },
  ], ts: ts(38) } as AgentEvent,
  tool("c1", "Bash", "python analysis/fig4.py --regions west", "fig4.svg écrit", 2400, 36),
  { kind: "tool", name: "__notice", detail: "Hook PostToolUse:Bash en erreur (code 1) : ruff a trouvé 2 avertissements dans analysis/fig4.py", tone: "warning", ts: ts(35) } as AgentEvent,
  {
    kind: "tool_update", id: "subagent:a1", name: "agent:activity", output: "", status: "inProgress", source: "claude",
    detail: "3 outils · 12k jetons",
    agentActivity: { tool: "activity", receiverThreadIds: ["a1"], agentsStates: { a1: { status: "running", message: "Lecture de tables/S2.csv" } }, agentThreadId: "a1", agentPath: "general-purpose", prompt: "Vérifie les unités de la table S2", activityKind: "interacted" },
    ts: ts(30),
  } as AgentEvent,
  { kind: "tool", name: "__notice", detail: "Mémoire enregistrée (1 fichier).", tone: "info", ts: ts(28) } as AgentEvent,
];

const ERROR: AgentEvent[] = [
  { kind: "user", text: "Relance l'extraction GEE MOD10A1 pour 2024.", ts: ts(500) } as AgentEvent,
  tool("e1", "Bash", "python extraction_gee_albedo.py --year 2024", "…", 4000, 490),
  tool("e2", "WebFetch", "earthengine.googleapis.com", "429 Too Many Requests", 1200, 480),
  { kind: "error", message: "Quota Earth Engine dépassé (429) — reprise possible après 60 min." } as AgentEvent,
  { kind: "done", ok: false, result: "Interrompu.", projectRoot: "/tmp/bench", filesChanged: [], usage: { context: 21000, output: 900, cost: 0.04, turns: 1 }, ts: ts(470) } as AgentEvent,
];

const MARKDOWN: AgentEvent[] = [
  { kind: "user", text: "Montre-moi le pipeline en Mermaid et un extrait du script.", ts: ts(300) } as AgentEvent,
  {
    kind: "text",
    text: "Voici le pipeline :\n\n```mermaid\nflowchart LR\n  GEE[GEE MOD10A1] --> CSV[Drive CSV]\n  CSV --> NAS[(NAS DuckDB)]\n  NAS --> FIG[fig3_spatial.svg]\n```\n\nEt l'extrait :\n\n```python\ndef trend(df, region):\n    slope = theilslopes(df.albedo, df.year)\n    return slope[0] * 100  # %/an\n```",
    ts: ts(295),
  } as AgentEvent,
  { kind: "done", ok: true, result: "ok", projectRoot: "/tmp/bench", filesChanged: [], usage: { context: 12000, output: 640, cost: 0.02, turns: 1 }, ts: ts(290) } as AgentEvent,
];

// Réponse type de Claude qui passe par TOUTE la grammaire Markdown qu'il
// produit réellement (titres, listes imbriquées, tâches, citation, tableau
// aligné, code, diff, maths, note de bas de page, barré, <br> de cellule) :
// le banc de référence du rendu typographique du chat.
const TYPESET: AgentEvent[] = [
  { kind: "user", text: "Fais le point sur la validation et propose la suite.", ts: ts(300) } as AgentEvent,
  {
    kind: "text",
    text: [
      "## Bilan de la validation",
      "",
      "La pente régionale reproduit **−0,35 %/an** (attendu *−0,33*), calculée dans `analysis/albedo_trends.py:42` avec l'estimateur de [Theil-Sen](https://en.wikipedia.org/wiki/Theil%E2%80%93Sen_estimator). L'ancienne valeur ~~−0,41 %/an~~ venait du masque de neige transitoire[^1].",
      "",
      "### Ce qui a changé",
      "",
      "- Le masque MOD10A1 exclut maintenant les pixels < 40 % de couverture",
      "  - seuil testé à 30, 40 et 50 %",
      "  - 40 % garde 92 % des glaciers",
      "- Les régions sont pondérées par l'aire glacier :",
      "  1. aire RGI 7.0",
      "  2. pondération $w_i = A_i / \\sum_j A_j$",
      "- Figure 3 régénérée : aires en km<sup>2</sup>, relance avec <kbd>Cmd</kbd>+<kbd>R</kbd>",
      "",
      "1. **Relire** la section 3.2 du manuscrit.",
      "",
      "   Le paragraphe sur les seuils cite encore l'ancienne valeur.",
      "",
      "2. **Relancer** la figure 4 :",
      "",
      "   ```bash",
      "   python analysis/fig4.py --regions west --mask 0.4",
      "   ```",
      "",
      "3. Vérifier les unités de la table S2.",
      "",
      "#### Tâches",
      "",
      "- [x] Reproduire W&M 2021",
      "- [x] Régénérer la figure 3",
      "- [ ] Mettre à jour la table S2",
      "",
      "> La tendance est robuste au choix du seuil : l'écart reste sous **0,02 %/an**",
      "> pour tous les seuils testés.",
      "",
      "| Région | Pente (%/an) | IC 95 % | n | Remarque |",
      "|:---|---:|:---:|---:|:---|",
      "| Coast | −0,41 | ±0,06 | 214 | Plus forte baisse<br>depuis 2015 |",
      "| Rockies | −0,29 | ±0,05 | 187 | Stable |",
      "| Interior | −0,33 | ±0,08 | 96 | Peu de pixels |",
      "",
      "Le forçage radiatif s'écrit :",
      "",
      "$$",
      "\\mathrm{RF} = -\\Delta\\alpha \\times SW_{\\downarrow} \\qquad [\\mathrm{W\\,m^{-2}}]",
      "$$",
      "",
      "```diff",
      "- MASK_THRESHOLD = 0.3",
      "+ MASK_THRESHOLD = 0.4",
      "```",
      "",
      "```python",
      "def trend(df, region):",
      "    \"\"\"Pente de Theil-Sen en %/an.\"\"\"",
      "    slope, *_ = theilslopes(df.albedo, df.year)",
      "    return slope * 100",
      "```",
      "",
      "```",
      "sortie brute sans langage",
      "```",
      "",
      "---",
      "",
      "Prochaine étape : valider la table S2 puis relire la section 3.2.",
      "",
      "[^1]: Williamson & Menounos (2021), section 2.3.",
    ].join("\n"),
    ts: ts(295),
  } as AgentEvent,
  { kind: "done", ok: true, result: "ok", projectRoot: "/tmp/bench", filesChanged: [], usage: { context: 12000, output: 640, cost: 0.02, turns: 1 }, ts: ts(290) } as AgentEvent,
];

const NO_HORIZONTAL_SCROLL: AgentEvent[] = [
  { kind: "user", text: "Explique le pipeline scientifique complet.", ts: ts(300) } as AgentEvent,
  {
    kind: "text",
    text: [
      "### Ce que la figure montre",
      "",
      "| Panneau | Contenu |",
      "| --- | --- |",
      "| a | Somme domaine (11 régions) de l’équivalent de fonte potentiel, en Gt w.e./an, avec une description volontairement longue |",
      "| b | Intensité régionale (mm w.e./an, moyenne pondérée par aire glacier) : 22 points scientifiques |",
      "",
      "$$",
      "\\mathrm{RF}=-\\Delta\\alpha_{fire,JJA}\\times SW\\qquad[\\mathrm{W\\,m^{-2}}]",
      "$$",
      "",
      "$$",
      "\\mathrm{melt}=\\mathrm{RF}\\times92\\times86400/L_f\\qquad[\\mathrm{mm\\,w.e.}]",
      "$$",
      "",
      "```python",
      "result = compute_fire_melt_budget_for_every_region_and_year_with_a_deliberately_long_identifier(dataset)",
      "```",
    ].join("\n"),
    ts: ts(295),
  } as AgentEvent,
  { kind: "done", ok: true, result: "ok", projectRoot: "/tmp/bench", filesChanged: [], ts: ts(290) } as AgentEvent,
];

// Tableaux de prose larges (capture Thierry 2026-10-31) : ils doivent tenir
// dans le panneau sans défilement horizontal, et s'empiler en fiches quand le
// panneau devient trop étroit.
const WIDE_TABLES: AgentEvent[] = [
  { kind: "user", text: "Compare les méthodes de conversion masse → concentration.", ts: ts(300) } as AgentEvent,
  {
    kind: "text",
    text: [
      "**2. De la masse à la concentration dans la neige : trois méthodes publiées**",
      "",
      "| Méthode | Source (lue) | Principe |",
      "| --- | --- | --- |",
      "| Couche de surface | Flanner et al. 2007, p. 5 : la couche « never exceeds 2-cm thickness » ; Doherty et al. 2014, *ACP*, p. 11700 : 1 à 3 cm dans CLM4 | On répartit le dépôt D[mg m⁻²] dans les 2 premiers centimètres de neige, de masse volumique ρ |",
      "| Dilution dans les précipitations | Khan et al. 2023, p. 6 : « 0.43 mg m⁻² mm⁻¹ or 432 µg L⁻¹ » | On divise le dépôt par la lame d’eau des précipitations de la même période |",
      "| Enrichissement par la fonte | Doherty et al. 2013, p. 5553 et éq. 2-4, p. 5561 | Quand la neige fond, les particules restent en surface : la concentration peut monter jusqu’à 10 à 100 fois la valeur initiale |",
      "",
      "| Région | Pente (%/an) | IC 95 % | n | Remarque |",
      "|:---|---:|:---:|---:|:---|",
      "| Coast | −0,41 | ±0,06 | 214 | Plus forte baisse depuis 2015 |",
      "| Rockies | −0,29 | ±0,05 | 187 | Stable |",
      "| Interior | −0,33 | ±0,08 | 96 | Peu de pixels |",
      "",
      "| Saison | Albédo |",
      "| --- | ---: |",
      "| Hiver | 0,72 |",
      "| Été | 0,41 |",
    ].join("\n"),
    ts: ts(295),
  } as AgentEvent,
  { kind: "done", ok: true, result: "ok", projectRoot: "/tmp/bench", filesChanged: [], ts: ts(290) } as AgentEvent,
];

const CONTEXTS_ATTACHMENTS = [
  { name: "albedo_trends.csv", lines: null, text: "ctx-1", kind: "file" as const },
  { name: "fig3_spatial.svg", lines: null, text: "ctx-2", kind: "file" as const },
  { name: "williamson_menounos_2021_supplementary_materials.pdf", lines: "p.4-9", text: "ctx-3", kind: "quote" as const },
  { name: "williamson_menounos_2021_supplementary_materials.pdf", lines: "p.12", text: "ctx-4", kind: "quote" as const },
  { name: "notes_reunion.md", lines: "40", text: "ctx-5", kind: "paste" as const },
  { name: "ch3_methodologie.tex", lines: null, text: "ctx-6", kind: "file" as const },
  // capture collée : la pilule doit montrer la VIGNETTE, pas une icône, et le
  // nom d'horodatage cède la place à un libellé parlant (2026-08-24)
  { name: "coller-1787605830634.png", lines: null, text: "ctx-7",
    imageUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAIAAABvFaqvAAAFlklEQVR42gXB0YesXAAA8P6cHnvs6dPH5eayxLLaLHMMk5iMJsMcwyTKaDLMMUxiMpoMcyyb2Kw2l3tcvvTQQ3o6T+mhP+T7/RhWqTnlP175Kyh/ROW3pHzLyhdQPjUlM5QPqLzbysNT7ki5hco1Vi5YCTPlXCgnohxr5dAqe6rsBsVhWPAfB/7y4I8AfovgWwJfMvgEINPAhwHeIXjY4O6BGwLXEFxiEGJwzsCpAEcCDjXYt2BHgTMAm2HVv5z6h1d/C+q3qH5J6qesZkD90NR3Q31A9W6rN0+9IvUSqmGsnrF6ytRjoR6Iuq/VXas6VLUHdcuw+h9O/83r34L+Jeqfkp7J+gfQ3zX9Yeh3qN9s/erpF6SHoX6O9RPWj5l+KPQ90Xe17rS6TfXtoG8Y1vzNmd+8+SWYn6KZSeaHbL4D86GZd8O8QfNqmxfPDJF5Ds1TbB6xecjMfWHuiOnUpt2aW2puBnPNsPCbg188/BRgJsIPCb7L8AHgXYM3A14hvNgw9OAZwVMIjzE8YLjP4K6ADoF2Dbct3FC4HuCKYa0vzvrkrUywPkTrXbIesnUH1k2zroZ1gVZoW2fPOiHrGFqH2Npja5dZTmHZxNrW1qa11tRaDdaSYd1Pzs1490Nw30X3Ibl32b0B96q5F8MNoXu23ZPnHpF7CN197O6w62SuXbhb4m5qd926K+ouB3fBsH7G+R+8/y74D9G/S/5N9q/Av2h+aPhn6J9s/+j5B+TvQ38X+w727czfFv6G+OvaX7X+kvqLwZ8zLPrg0DuPHgK6i+gmoauMLgCFGjob6ATR0UYHD+0R2oXIiZGN0TZDmwKtCVrVaNmiBUXzAWkMG7xzwYMP7kJwE4OrFFzkIATBWQtORnCEwcEO9l6wQ4ETBnYcbHGwyYJ1EaxIsKyDRRvMaaANwYxhowcX3fnoJkRXMbpIUShHZxCdtOhoRAcY7e1o50UOiuww2sbRBkfrLFoV0ZJEizqat5FGo9kQTRk2uXPJjU+uQnIRk1BKznJyAslRSw5GsofJzk4cL7FRsg2TTZyscbLKkmWRLEgyrxOtTWY0mQ7JhGHxjcNXHl8EHIr4LOGTjI8AHzS8N/AOYsfGtoe3CG9CvI7xCuNlhhcFnhOs1XjW4inFkwG/MWx65dILn4ZCehbTk5Qe5fQA0r2W7ozUgaltp1sv3aB0HaarOF3idJGl8yLVSDqr02mbTmj6NqSvDJtfuDzk87OQn8T8KOUHOd+DfKfljpHbMN/a+cbL1yhfhfkyzhc4n2e5VuQzkk/rfNLmbzR/HfIXhi1Drjzz5Ukoj2J5kMq9XO5A6WilbZRbWG7scu2VK1Quw3IRl3Ncalk5K8opKSd1+daWr7R8GcpnhiVnjpx4chTIQSR7iexk4gBia2RrkA0ka5usPLJEZBGSeUw0TGYZmRZkQshbTV5b8kLJ80Akhq1OXHXkq4NQ7cVqJ1WOXNmg2mrVxqjWsFrZ1dKrFqiah5UWVzNcTbNqUlRvpHqtq5e2eqaVNFRPDNscuebAN3uh2YmNIzW23GxBs9GatdGsYLO0m4XXzFGjhc0sbqa4mWTNW9G8kualbp7bRqLN09D8YtjuwHV7vtsJnSN2ttRt5W4DurXWrYxuCbuF3c29TkPdLOymcTfB3VvWvRbdC+me605quyfa/Rq6nwxL9xzd8dQRqC3SrUQ3Ml0DutLo0qALSOc21Tw6Q3Qa0klM3zB9zehLQZ8JlWr61NJflP4c6A+G7Xdc7/C9LfRbsd9I/VruV6Bfav3C6Oew1+x+5vVT1E/C/i3uX3H/kvXPRS+R/qnuf7X9T9r/GPp/GXZ0uNHmx60wbsRxLY0reVyCcaGNc2PU4Dizx6k3TtD4Fo6v8fiCx+dslIrxiYy/6vFnO/6g47/D+M//R5m1rp1APu0AAAAASUVORK5CYII=" },
];

const QUEUED_TURNS: QueuedTurn[] = [
  {
    id: "queue-1", prompt: "Compare ensuite les résultats avec la version précédente.",
    provider: "claude", model: "claude-fable-5", effort: "medium", permissionMode: "acceptEdits", fastMode: false,
    attachments: [], webSearch: false, additionalDirectories: [], pluginSkills: [], autoReview: null, createdAt: ts(8),
  },
  {
    id: "queue-2", prompt: "Prépare finalement une légende courte pour la figure 3.",
    provider: "claude", model: "claude-fable-5", effort: "medium", permissionMode: "acceptEdits", fastMode: false,
    attachments: [], webSearch: false, additionalDirectories: [], pluginSkills: [], autoReview: null, createdAt: ts(4),
  },
];

// --- Scénario VIVANT (diagnostic « ça monte et ça descend », 2026-08-23) ---
// Rejoue un tour réaliste DANS LE TEMPS : pensée qui grandit mot à mot, outil
// qui court avec fenêtre de silence (→ « en attente · Ns »), dépôts successifs
// (→ apparition du cumul), puis réponse streamée. Sert au banc de mesure des
// sauts de scroll ; aucune capture golden ne le référence (non déterministe).
const LIVE_THOUGHT = ("Je dois vérifier la section méthodes contre les sorties du pipeline avant de répondre. "
  + "D'abord relire le panel bayésien, puis confronter chaque chiffre cité au CSV source, et enfin juger "
  + "si la structure de la section tient la route pour la soumission.").split(" ");
const LIVE_ANSWER = ("La section est solide dans l'ensemble. **Points forts** : la chaîne de "
  + "traçabilité des chiffres est complète, chaque valeur citée provient d'un artefact "
  + "vérifiable, et la justification du modèle Student-t est bien argumentée.\n\n"
  + "**À corriger avant soumission** :\n\n1. Le seuil NDSI cité (0,42) ne correspond pas "
  + "au code (0,40).\n2. La phrase sur les 11 sous-régions gagnerait une référence RGI v7 "
  + "explicite.\n3. Le tableau 2 répète une valeur déjà donnée dans le texte.\n\n"
  + "Rien de structurel : une passe de cohérence chiffre-par-chiffre suffit.").split(" ");

function liveEventsAt(elapsedMs: number): AgentEvent[] {
  const out: AgentEvent[] = [
    { kind: "user", text: "que penses tu de cette section", ts: NOW, label: "methods_en.tex (lines 198-224)" } as AgentEvent,
    { kind: "started", ts: NOW } as AgentEvent,
  ];
  // 0,2 s → ~3,2 s : la pensée grandit mot à mot
  if (elapsedMs >= 200) {
    const mots = Math.min(LIVE_THOUGHT.length, Math.floor((elapsedMs - 200) / 60));
    if (mots > 0) out.push({ kind: "thinking_live", text: LIVE_THOUGHT.slice(0, mots).join(" "), ts: NOW } as AgentEvent);
  }
  // 3,4 s : un Bash part et court 5 s — fenêtre de silence, comme la capture
  // de Thierry (« A exécuté f=$(find …) » + « en attente · 3 s »)
  if (elapsedMs >= 3400) {
    out.push({
      kind: "tool_update", id: "live-bash", name: "Bash",
      detail: 'f=$(find . -name "panel_bayes_JJA.csv" 2>/dev/null | head -1); echo "FILE: $f"',
      output: elapsedMs >= 8400 ? "FILE: ./data/panel_bayes_JJA.csv" : "",
      status: elapsedMs >= 8400 ? "completed" : "running", input: {}, source: null,
      durationMs: elapsedMs >= 8400 ? 5000 : undefined, ts: NOW,
    } as AgentEvent);
  }
  // 8,6 s puis 9,0 s : deux lectures déposées (déclenche le cumul à ≥2 lignes)
  if (elapsedMs >= 8600) out.push(tool("live-r1", "Read", "manuscrit/methods_en.tex", "27 lignes", 300, 0));
  if (elapsedMs >= 9000) out.push(tool("live-r2", "Read", "analysis/panel_bayes.py", "180 lignes", 260, 0));
  // 9,6 s → fin : réponse streamée mot à mot (~18 mots/s)
  if (elapsedMs >= 9600) {
    const mots = Math.min(LIVE_ANSWER.length, Math.floor((elapsedMs - 9600) / 55));
    if (mots > 0) out.push({ kind: "streaming", text: LIVE_ANSWER.slice(0, mots).join(" "), ts: NOW } as AgentEvent);
  }
  return out;
}

// Transcript long : vérifier en vrai navigateur que la liste virtualise
// (pendant du test jsdom « virtualise un long transcript »).
// Fil long RÉALISTE : 200 questions réparties sur plusieurs séances, avec de
// vraies pauses entre elles (2 s d'écart partout ne produisait qu'un chapitre
// et ne disait rien du pli de la marge — plan « marge pliée », 2026-08-25).
const LONG_TRANSCRIPT: AgentEvent[] = (() => {
  const out: AgentEvent[] = [];
  const SEANCES = [26, 21, 9, 5, 2, 0.4];   // heures avant maintenant
  let n = 0;
  SEANCES.forEach((heures, s) => {
    const depart = ts(heures * 3600);
    const combien = [40, 30, 46, 28, 42, 14][s];
    for (let i = 0; i < combien; i++) {
      const quand = depart + i * 95_000;    // ~1,6 min entre deux questions
      out.push({ kind: "user", text: `Question ${n}`, ts: quand } as AgentEvent);
      out.push({
        kind: "text",
        text: `Réponse ${n} — un paragraphe de longueur raisonnable pour donner une hauteur réaliste à la ligne.`,
        ts: quand + 20_000,
      } as AgentEvent);
      n += 1;
    }
  });
  return out;
})();

/** Épingles du fil long : le pli doit montrer les marques EN RELIEF. */
const LONG_PINS = [
  { index: 34, label: "structure conforme B2 ?", anchor: "Question 17" },
  { index: 96, label: "science ouverte + ODD", anchor: "Question 48" },
  { index: 210, label: "reference isabelle", anchor: "Question 105" },
  { index: 288, label: "4 pages, compile propre", anchor: "Question 144" },
];

// Spécialistes du banc (plan specialistes-2026-10-18) : fiches de
// démonstration, aucun texte réel.
const BENCH_SPECIALISTES: Specialiste[] = [
  { id: "sp1", nom: "Glaciologue albédo", nomCourt: "Glaciologue", role: "Albédo des glaciers, MODIS et Landsat",
    instructions: "Tu es glaciologue.", skills: ["bilan-energie-fonte"], tousSkills: false, connecteurs: ["scholar"], visible: true },
  { id: "sp2", nom: "Analyste stats", nomCourt: "Stats", role: "Modèles bayésiens et tendances",
    instructions: "Tu es statisticien.", skills: [], tousSkills: true, connecteurs: [], visible: true },
  { id: "sp3", nom: "Références", nomCourt: "Références", role: "Trouver et vérifier les sources",
    instructions: "Tu vérifies les références.", skills: [], tousSkills: true, connecteurs: ["scholar"], visible: true },
];

const PROPOSAL: AgentEvent[] = [
  { kind: "user", text: "Je voudrais un spécialiste pour le glacier Peyto, tu peux le partir avec moi ?", ts: ts(40) },
  { kind: "text", text: "Voici une première fiche. Garde-la telle quelle ou ajuste-la dans les réglages.", ts: ts(30) },
  { kind: "specialist_proposal", id: "sp_bench", ts: ts(28), proposal: {
    nom: "Spécialiste Peyto", nomCourt: "Peyto", role: "Bilan de masse et albédo du glacier Peyto (Rocheuses canadiennes).",
    instructions: "Tu connais le glacier Peyto : stations météo, bilans de masse annuels et séries d'albédo.\nCite toujours la source d'une valeur mesurée.\nDistingue les mesures de terrain des produits satellitaires.",
    skills: ["bilan-energie-fonte", "chaine-donnees-albedo"], connecteurs: ["scholar"], replaceId: null,
  } } as AgentEvent,
];

// Rangées d'actions (refonte 2026-10-18) : Claude décrit chaque commande
// (`input.description`, la phrase devient le titre de la rangée), une pensée
// cite du code entre backticks, un échec porte son code de sortie, et la
// dernière commande tourne encore. Pendant Codex : la sortie arrive au fil de
// l'eau, les trois dernières lignes vivent sous la rangée en cours.
const bash = (id: string, command: string, description: string | null, output: string, status: string, offsetS: number, extra: Record<string, unknown> = {}): AgentEvent => ({
  kind: "tool_update", id, name: "Bash", detail: command, output, status, source: null, ts: ts(offsetS),
  input: description ? { command, description } : { command }, ...extra,
} as AgentEvent);

const ACTIONS_CLAUDE: AgentEvent[] = [
  { kind: "user", text: "Vérifie que les figures du chapitre 2 tiennent dans la colonne, puis recompile.", ts: ts(58) } as AgentEvent,
  { kind: "thinking", text: "Les figures sont dans `figures/ch2/`. Je compare leur largeur au `\\columnwidth` du gabarit avant de recompiler.", ts: ts(56) } as AgentEvent,
  tool("ac-read", "Read", "manuscrit/chapitre2.tex", "412 lignes", 300, 54),
  bash("ac-width", "python scripts/largeur_figures.py figures/ch2 --max 8.4cm", "Vérifie la largeur des figures du chapitre 2",
    "7 figures conformes, 1 trop large : fig2_5.pdf (9,1 cm)", "completed", 50, { durationMs: 1300 }),
  bash("ac-build", "latexmk -pdf -interaction=nonstopmode manuscrit/these.tex", "Compile la thèse en PDF",
    "! LaTeX Error: File `fig2_5_v2.pdf' not found.", "failed", 44, { durationMs: 4200, exitCode: 12 }),
  { kind: "text", text: "La compilation cherche `fig2_5_v2.pdf`, qui n'existe pas encore. Je régénère la figure à 8,4 cm puis je relance.", ts: ts(38) } as AgentEvent,
  tool("ac-edit", "Edit", "analysis/fig2_5.py", "Largeur fixée à 8,4 cm", 900, 30),
  bash("ac-regen", "python analysis/fig2_5.py --width 8.4cm -o figures/ch2/fig2_5_v2.pdf", "Régénère la figure 2.5 à la largeur de colonne",
    "", "running", 12),
];

// Sous-agents Claude (maquette 2026-10-18, piste A) : la mission titre chaque
// rangée, le type passe en étiquette ; en cours puis terminés.
function claudeAgent(id: string, type: string, description: string, status: string, offsetS: number, message?: string): AgentEvent {
  // Comme le CLI : un seul id par agent, le fil n'en garde que le dernier état.
  return {
    kind: "tool_update", id: `subagent:${id}`, name: "agent:activity", output: "",
    status: status === "running" ? "inProgress" : "completed", source: "claude",
    agentActivity: { tool: "activity", receiverThreadIds: [id], agentThreadId: id, agentPath: type, description, startedAt: ts(64),
      ...(status === "running" ? {} : { durationMs: (64 - offsetS) * 1000 }),
      prompt: AGENT_PROMPTS[id],
      agentsStates: { [id]: { status, message: message ?? description } }, activityKind: status === "running" ? "started" : "notification" },
    ts: ts(offsetS),
  } as AgentEvent;
}
const AGENT_PROMPTS: Record<string, string> = {
  fig: "Liste toutes les figures citées dans manuscrit/chapitre2.tex et vérifie que chaque fichier existe dans figures/ch2/ à la largeur de colonne (8,4 cm).",
  meth: "Relis la section Méthode de manuscrit/chapitre2.tex. Repère les phrases ambiguës ou les étapes du traitement MODIS qui manquent, et propose une reformulation courte pour chacune.",
  calc: "Recalcule l'albédo moyen de juin à août pour la région ouest avec analysis/albedo_jja.py et compare-le à la valeur du tableau 2.3.",
};
// Transcripts des sous-agents (vue à la place du chat, 2026-10-19) : ce que
// getAgentHistory relit du disque pour un agent Claude.
const AGENT_TRANSCRIPTS = new Map<string, AgentEvent[]>([
  ["meth", [
    { kind: "thinking", text: "Je lis d'abord la section en entier pour repérer l'ordre des étapes.", ts: ts(62) } as AgentEvent,
    tool("m-read", "Read", "manuscrit/chapitre2.tex", "lignes 120 à 310", 400, 60),
    { ...tool("m-grep", "Grep", "MOD10A1|MCD43A3", "7 occurrences", 200, 56), input: { pattern: "MOD10A1|MCD43A3", path: "manuscrit" } } as AgentEvent,
    { kind: "text", text: "La section décrit le filtrage des pixels nuageux mais ne dit pas quel seuil de qualité est retenu (QA ≤ 1 ou QA ≤ 2). La correction de pente est annoncée sans référence.", ts: ts(50) } as AgentEvent,
    tool("m-read2", "Read", "analysis/masque_qa.py", "84 lignes", 300, 44),
    { kind: "text", text: "Le script garde QA ≤ 1 : la phrase peut le dire explicitement. Je vérifie maintenant la troisième étape, l'agrégation journalière.", ts: ts(36) } as AgentEvent,
    { ...tool("m-read3", "Read", "analysis/agregation.py", "", 0, 32), status: "running" } as AgentEvent,
  ]],
  ["fig", [
    { ...tool("f-grep", "Grep", "includegraphics", "6 figures citées", 200, 62), input: { pattern: "includegraphics", path: "manuscrit/chapitre2.tex" } } as AgentEvent,
    { ...tool("f-glob", "Glob", "figures/ch2/*.pdf", "6 fichiers", 100, 58), input: { pattern: "figures/ch2/*.pdf" } } as AgentEvent,
    { kind: "text", text: "Six figures dans figures/ch2/. Deux dépassent la colonne : **fig2_3.pdf** (9,1 cm) et **fig2_5.pdf** (10,2 cm).", ts: ts(48) } as AgentEvent,
  ]],
]);
const AGENTS_CLAUDE_START: AgentEvent[] = [
  { kind: "user", text: "Vérifie les figures du chapitre 2, relis la section Méthode et recalcule l'albédo moyen JJA.", ts: ts(70) } as AgentEvent,
  tool("sa-read", "Read", "manuscrit/chapitre2.tex", "412 lignes", 300, 68),
  { kind: "text", text: "Je confie les trois vérifications à des sous-agents, en parallèle.", ts: ts(66) } as AgentEvent,
  claudeAgent("fig", "Explore", "Repère les figures du chapitre 2", "running", 64),
  claudeAgent("meth", "general-purpose", "Relit la section Méthode", "running", 64),
  claudeAgent("calc", "general-purpose", "Recalcule l'albédo moyen JJA", "running", 64),
];
// Spécialistes délégués depuis le fil (panneau des agents, 2026-10-21).
const BENCH_LINKED_SPECIALISTS = [
  { id: "spec-red", provider: "Codex", title: "Mise à jour du manuscrit du ch. 2", paused: false, direction: "child" as const,
    specialiste: { nom: "Rédacteur corpus", nomCourt: "Rédacteur" }, running: true, since: ts(250) },
  { id: "spec-nat", provider: "Claude", title: "Figure supplémentaire (Nature Geoscience)", paused: false, direction: "child" as const,
    specialiste: { nom: "Nature Figures", nomCourt: "Nature" }, running: false, updatedAt: new Date(ts(1080)).toISOString() },
];
const AGENTS_CLAUDE: AgentEvent[] = [
  ...AGENTS_CLAUDE_START,
  claudeAgent("fig", "Explore", "Repère les figures du chapitre 2", "completed", 46, "Six figures dans figures/ch2/."),
  claudeAgent("meth", "general-purpose", "Relit la section Méthode", "running", 30, "Lit Chapitre2.tex, lignes 120 à 310"),
  claudeAgent("calc", "general-purpose", "Recalcule l'albédo moyen JJA", "running", 28, "Exécute python albedo_jja.py --region ouest"),
];
const AGENTS_CLAUDE_DONE: AgentEvent[] = [
  ...AGENTS_CLAUDE_START,
  claudeAgent("fig", "Explore", "Repère les figures du chapitre 2", "completed", 46, "Six figures dans figures/ch2/."),
  claudeAgent("calc", "general-purpose", "Recalcule l'albédo moyen JJA", "completed", 12, "Albédo moyen JJA 0,41."),
  claudeAgent("meth", "general-purpose", "Relit la section Méthode", "completed", 0, "Trois phrases ambiguës."),
  { kind: "text", text: "Deux figures dépassent la colonne et la section Méthode a trois passages à reprendre. Je commence par les figures.", ts: ts(0) } as AgentEvent,
  { kind: "done", ok: true, result: "ok", projectRoot: "/tmp/bench", filesChanged: [], usage: { context: 33000, output: 900, cost: null, turns: 1 }, ts: ts(0) } as AgentEvent,
];

const ACTIONS_CODEX: AgentEvent[] = [
  { kind: "user", text: "Lance les tests du pipeline d'albédo.", ts: ts(40) } as AgentEvent,
  bash("cx-ls", "ls tests/", null, "test_masque.py  test_pentes.py  test_regions.py", "completed", 36, { durationMs: 120, source: "codex" }),
  bash("cx-test", "pytest tests/ -q", null,
    ["tests/test_masque.py ........".padEnd(44) + "[ 34%]", "tests/test_pentes.py ..........".padEnd(44) + "[ 77%]", "tests/test_regions.py ..."].join("\n"),
    "inProgress", 18, { source: "codex" }),
];

type BenchState = {
  events: AgentEvent[];
  workingSince: number | null;
  attachments: typeof CONTEXTS_ATTACHMENTS;
  usage: { context: number; output: number; cost: number | null; turns: number | null } | null;
  pins?: { index: number; label: string; anchor: string }[];
  queuedTurns?: QueuedTurn[];
  draftText?: string;
};


// Fichiers modifiés dans le fil (refonte 2026-10-18) : une édition à extrait,
// un fichier créé, une édition sans extrait, au milieu des autres lignes.
const COMPARER_PY = [
  '"""Compare deux sorties de controle.py tableau par tableau. Usage : python comparer.py a.npz b.npz.',
  "Écrit sur la sortie standard, pour chaque tableau, « identique » ou l'écart maximal.",
  "",
  "Les log-densités (clés logp_*) sont comparées à une tolérance relative de 1e-13.",
  'Tout le reste doit être identique au bit près."""',
  "import sys",
  "",
  "import numpy as np",
  "",
  "TOLERANCE_LOGP = 1e-13",
  "",
  "a, b = np.load(sys.argv[1]), np.load(sys.argv[2])",
  'assert sorted(a.files) == sorted(b.files), f"clés différentes : {set(a.files) ^ set(b.files)}"',
  "ecart = 0",
  "for cle in sorted(a.files):",
  "    x, y = a[cle], b[cle]",
  "",
].join("\n");
const EDITS: AgentEvent[] = [
  { kind: "user", text: "Ajoute un script qui compare les deux sorties.", ts: ts(80) } as AgentEvent,
  { kind: "started", ts: ts(79) } as AgentEvent,
  tool("e1", "Bash", "PY=/Users/thierry/.claude-science/conda/envs/pymc-albedo/bin/python controle.py", "ok", 8300, 75),
  { kind: "tool_update", id: "e2", name: "Edit", output: "", status: "completed", durationMs: 120, ts: ts(70) } as AgentEvent,
  { kind: "edit", projectRoot: "/tmp/bench", ts: ts(70), files: [{
    path: "build/controle_bayes_mv_lib/controle.py", add: null, del: null,
    oldText: 'for nom, f in modeles.items():\n    idata = f(donnees, seed=SEED)\n    np.savez(sortie / f"{nom}.npz", **extraire(idata))\n    print(nom, "ok")\n',
    newText: 'for nom, f in modeles.items():\n    idata = f(donnees, seed=SEED)\n    tableaux = extraire(idata, logp=True)\n    np.savez_compressed(sortie / f"{nom}.npz", **tableaux)\n    print(nom, "ok")\n',
  }] } as AgentEvent,
  { kind: "tool_update", id: "e3", name: "Write", output: "", status: "completed", durationMs: 90, ts: ts(60) } as AgentEvent,
  { kind: "edit", projectRoot: "/tmp/bench", ts: ts(60), files: [{
    path: "build/controle_bayes_mv_lib/comparer.py", add: null, del: null, newText: COMPARER_PY,
  }] } as AgentEvent,
  { kind: "tool_update", id: "e4", name: "Edit", output: "", status: "completed", durationMs: 80, ts: ts(50) } as AgentEvent,
  { kind: "edit", projectRoot: "/tmp/bench", ts: ts(50), files: [{ path: "README.md", add: 6, del: 2 }] } as AgentEvent,
  { kind: "tool_update", id: "e5", name: "Bash", detail: "python comparer.py a.npz b.npz", output: "", status: "running", input: {}, source: null, ts: ts(40) } as AgentEvent,
];

// Figure annotée envoyée depuis la galerie (2026-10-20) : l'enveloppe reste
// dans le texte (agent, réédition) mais seule la carte s'affiche.
const FIGURE_THUMB = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#f6f6f2"/><path d="M10 40 30 28 50 36 70 18 110 30M10 70 30 62 50 74 70 54 110 66" fill="none" stroke="#4a4a48" stroke-width="2"/><rect x="10" y="88" width="100" height="22" fill="#94d2bd"/><circle cx="78" cy="40" r="9" fill="#141413"/><text x="78" y="44" text-anchor="middle" font-size="11" font-family="sans-serif" fill="#fff">1</text></svg>');
const FIGURE_ENVELOPE = `.fig_thumbs/annotation-previews/figS_snowpack_jun1_ts_provisoire_alaska_zones_RGI_annot_1792458432712055000.png
Annotations (badges numerotes sur l'image) :
1. est-ce que 2012 est reconnu pour une année neigeuse?
Figure source : /Users/tofunori/Documents/UTQR/Doctorat/Chapitre1-Albedo/figures/supp/figS_snowpack_jun1_ts_provisoire_alaska_zones_RGI.png
Version affichée : v1 (SHA-256 db6186444a4a25b0c4f18d1b789e564aca1ee38cc8f2adc8fd904a0f29981c1e). La pièce jointe correspond à cette version ; le fichier source peut avoir changé.`;
const FIGURE: AgentEvent[] = [
  { kind: "user", text: FIGURE_ENVELOPE, ts: ts(120), label: "figS_snowpack_jun1_ts_provisoire_alaska_zones_RGI.png",
    imageUrl: FIGURE_THUMB, notes: [{ n: 1, text: "est-ce que 2012 est reconnu pour une année neigeuse?" }] } as AgentEvent,
  { kind: "text", text: "Oui : en Alaska, l'hiver 2011-2012 a laissé un manteau nettement supérieur à la normale au 1er juin.", ts: ts(110) } as AgentEvent,
  { kind: "user", text: `Compare avec les relevés SNOTEL avant de répondre.\n\n${FIGURE_ENVELOPE}`, ts: ts(60),
    label: "figS_snowpack_jun1_ts_provisoire_alaska_zones_RGI.png", imagePaths: [FIGURE_THUMB] } as AgentEvent,
];

const STATES: Record<string, BenchState> = {
  annotations: {events: [
    {kind:"user",text:"Relis les résultats et les méthodes.",label:"results_en.tex · methods_en.tex",ts:ts(10)},
    {kind:"text",text:Array.from({length:10},(_,i)=>`### Passage ${i+1}\n\n${i===4||i===5 ? `In the other seven regions, forcing remains below 0.65~W~m $^{-2}$, although individual summers reach much higher values (${i+1}).` : `Observation ${i+1} : une phrase avec du **gras** et de l’*italique* à annoter.`}`).join("\n\n")},
  ] as AgentEvent[],workingSince:null,attachments:[],usage:null},
  firstmessage: { events: [], workingSince: null, attachments: [], usage: null },
  figure: { events: FIGURE, workingSince: null, attachments: [], usage: null },
  livestream: { events: [], workingSince: NOW, attachments: [], usage: { context: 21000, output: 300, cost: null, turns: 1 } },
  long: { events: LONG_TRANSCRIPT, workingSince: null, attachments: [], usage: null, pins: LONG_PINS },
  edits: { events: EDITS, workingSince: ts(80), attachments: [], usage: { context: 30000, output: 900, cost: null, turns: 1 } },
  rich: { events: RICH, workingSince: null, attachments: [], usage: { context: 84200, output: 8120, cost: 0.42, turns: 3 } },
  running: { events: RUNNING, workingSince: ts(272), attachments: [], usage: { context: 21000, output: 300, cost: null, turns: 1 } },
  stream: { events: STREAM, workingSince: ts(30), attachments: [], usage: { context: 18500, output: 420, cost: null, turns: 1 } },
  activityparity: { events: ACTIVITY_PARITY, workingSince: ts(36), attachments: [], usage: { context: 16200, output: 280, cost: null, turns: 1 } },
  slottransition: { events: SLOT_TRANSITION, workingSince: ts(24), attachments: [], usage: { context: 15100, output: 210, cost: null, turns: 1 } },
  thinking: { events: THINKING, workingSince: ts(20), attachments: [], usage: { context: 14000, output: 0, cost: null, turns: 1 } },
  cinqlectures: { events: CINQ_LECTURES, workingSince: ts(110), attachments: [], usage: null },
  ordrepensee: { events: THINKING_ORDER, workingSince: ts(30), attachments: [], usage: null },
  hermesreply: { events: HERMES_REPLY, workingSince: null, attachments: [], usage: { context: 96000, output: 4200, cost: 0.31, turns: 1 } },
  longthinking: { events: LONG_THINKING, workingSince: ts(60), attachments: [], usage: { context: 15000, output: 0, cost: null, turns: 1 } },
  image: { events: IMAGE_VIEW, workingSince: ts(20), attachments: [], usage: { context: 14000, output: 0, cost: null, turns: 1 } },
  agents: { events: AGENTS, workingSince: ts(32), attachments: [], usage: { context: 22000, output: 420, cost: null, turns: 1 } },
  error: { events: ERROR, workingSince: null, attachments: [], usage: null },
  contexts: { events: MARKDOWN.slice(0, 1), workingSince: null, attachments: CONTEXTS_ATTACHMENTS, usage: null },
  markdown: { events: MARKDOWN, workingSince: null, attachments: [], usage: null },
  typeset: { events: TYPESET, workingSince: null, attachments: [], usage: null },
  proposal: { events: PROPOSAL, workingSince: null, attachments: [], usage: null },
  actionsclaude: { events: ACTIONS_CLAUDE, workingSince: ts(58), attachments: [], usage: { context: 31000, output: 640, cost: null, turns: 1 } },
  actionscodex: { events: ACTIONS_CODEX, workingSince: ts(40), attachments: [], usage: { context: 19000, output: 220, cost: null, turns: 1 } },
  claudeagents: { events: AGENTS_CLAUDE, workingSince: ts(70), attachments: [], usage: { context: 26000, output: 300, cost: null, turns: 1 } },
  finagents: { events: AGENTS_CLAUDE_DONE, workingSince: null, attachments: [], usage: { context: 33000, output: 900, cost: null, turns: 1 } },
  cli: { events: CLI_EVENTS, workingSince: ts(40), attachments: [], usage: { context: 24000, output: 520, cost: null, turns: 1 } },
  overflow: { events: NO_HORIZONTAL_SCROLL, workingSince: null, attachments: [], usage: null },
  tables: { events: WIDE_TABLES, workingSince: null, attachments: [], usage: null },
  queue: {
    events: RUNNING, workingSince: ts(272), attachments: [],
    usage: { context: 21000, output: 300, cost: null, turns: 1 },
    queuedTurns: QUEUED_TURNS,
    draftText: "Ajoute aussi une vérification des unités.",
  },
  goal: {
    events: [...RICH, { kind: "goal", goal: {
      objective: "Reprendre l'analyse des tendances régionales et produire une figure 3 vérifiée pour le manuscrit",
      status: "blocked", tokenBudget: 120000, tokensUsed: 34800, timeUsedSeconds: 305,
    }, ts: ts(2) } as AgentEvent],
    workingSince: null, attachments: [], usage: { context: 84200, output: 8120, cost: 0.42, turns: 3 },
  },
};

export function ChatBench() {
  const hash = window.location.hash;
  const light = hash.includes("-light");
  const menuBench = hash.includes("-menus");
  const replay = hash.includes("-replay");
  const replayFixture = hash.includes("-replayclaude") ? claudeObservedLive
    : hash.includes("-replaycodex") ? codexObservedLive : codexComposite;
  const [replayCount, setReplayCount] = useState(1);
  const [replayReload, setReplayReload] = useState(false);
  const replayWire = replayFixture.events.slice(0, replayCount);
  const replayEvents = replayReload ? materializeHarnessHistory([...replayWire]) : reduceHarnessEvents([], replayWire);
  const replayFinished = replayWire.some(event => event.kind === "done" || event.kind === "error");
  const [menuConsigne, setMenuConsigne] = useState<ConsigneDuFil | null>(() => hash.includes("-specialiste")
    ? choisirSpecialiste(basculerConsigne(basculerConsigne(null, CONSIGNES_LIVREES[0]), CONSIGNES_LIVREES[3]), BENCH_SPECIALISTES[0])
    : null);
  const [menuKb, setMenuKb] = useState({ kbSourceIds: [] as string[], kbFullContent: [] as string[] });
  const key = Object.keys(STATES).find((k) => hash.includes(`-${k}`)) ?? "rich";
  const st = STATES[key];
  const [firstMessageEvents, setFirstMessageEvents] = useState<AgentEvent[]>([]);
  const [firstMessageWorkingSince, setFirstMessageWorkingSince] = useState<number | null>(null);
  const firstMessageStartedTimer = useRef<number | null>(null);
  const interactiveFirstMessage = key === "firstmessage";
  // Scénario vivant : un tick 80 ms recalcule les événements depuis le départ.
  const isLive = key === "livestream";
  const [liveElapsed, setLiveElapsed] = useState(0);
  useEffect(() => {
    if (!isLive) return;
    const started = Date.now();
    // Boucle : le cycle recommence toutes les 27 s pour pouvoir observer le
    // scénario complet sans devoir recharger la page au bon moment.
    const id = window.setInterval(() => setLiveElapsed((Date.now() - started) % 27000), 80);
    return () => window.clearInterval(id);
  }, [isLive]);
  const activeState = replay
    ? { ...st, events: replayEvents, workingSince: replayFinished && !hash.includes('-stale') ? null : NOW }
    : interactiveFirstMessage
    ? { ...st, events: firstMessageEvents, workingSince: firstMessageWorkingSince }
    : isLive
    ? { ...st, events: liveEventsAt(liveElapsed) }
    : st;

  useEffect(() => {
    if (light) document.documentElement.setAttribute("data-theme", "light");
    return () => document.documentElement.removeAttribute("data-theme");
  }, [light]);
  useEffect(() => () => {
    if (firstMessageStartedTimer.current != null) window.clearTimeout(firstMessageStartedTimer.current);
  }, []);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--text-primary)" }}>
      {replay && <div style={{ padding: 8, display: "flex", gap: 12, alignItems: "center", fontSize: 13 }}>
        <span>{replayFixture.provider} · {replayFixture.provenance === "observed" ? "Capture anonymisée" : "Scénario composé"}</span>
        <label>Étape <select aria-label="Étape du replay" value={replayCount} onChange={event => { setReplayCount(Number(event.target.value)); setReplayReload(false); }}>
          {replayFixture.events.map((event, index) => <option key={index} value={index + 1}>{index + 1} · {event.kind}{"status" in event ? ` · ${event.status}` : ""}</option>)}
        </select></label>
        <Button onClick={() => setReplayReload(true)}>Recharger l’historique</Button>
      </div>}
      <Chat
        events={activeState.events}
        workingSince={activeState.workingSince}
        commands={[{ name: "recherche", source: "user" }]}
        files={[]} recentFiles={[]} zoteroItems={[]}
        injectText={null} onInjected={noop}
        draftText={st.draftText}
        queuedTurns={st.queuedTurns}
        onSteerQueued={noop}
        onEditQueued={noop}
        onRemoveQueued={noop}
        onReorderQueued={noop}
        attachments={activeState.attachments}
        onRemoveAttachment={noop}
        onQuote={noop}
        threadId="bench-thread"
        threadTitle="Validation W&M — régions ouest"
        threadProvider={replay ? replayFixture.provider : (menuBench && hash.includes("-codex")) || key === "goal" || key === "agents" || key === "actionscodex" ? "codex" : "claude"}
        onPasteImage={noop} onPasteText={noop} onStop={noop}
        layout="chat" onToggleExpand={noop}
        usage={activeState.usage}
        onRevert={noop} onFork={noop} onEditSend={noop}
        onNewChat={noop} onOpenProject={noop}
        highlights={[]}
        consigneDuFil={menuBench ? menuConsigne : undefined}
        onChoisirConsigne={menuBench ? setMenuConsigne : undefined}
        onKbChange={menuBench ? setMenuKb : undefined}
        kbSourceIds={menuKb.kbSourceIds}
        kbFullContent={menuKb.kbFullContent}
        defaults={{ consignes: menuBench ? CONSIGNES_LIVREES : undefined, specialistes: menuBench ? BENCH_SPECIALISTES : undefined, defaultProvider: "claude", defaultModel: {}, defaultEffort: {}, defaultPermissionMode: "acceptEdits" }}
        providers={PROVIDERS}
        // une épingle figée : le banc doit montrer les DEUX intensités de la
        // marge (repère de prompt éteint, épingle accentuée et nommée)
        pins={activeState.pins ?? BENCH_PINS} onStylePin={noop} onTogglePin={noop}
        disabled={false}
        onSubmit={interactiveFirstMessage ? (prompt) => {
          setFirstMessageEvents([{ kind: "user", text: prompt, ts: Date.now() } as AgentEvent]);
          setFirstMessageWorkingSince(Date.now());
          firstMessageStartedTimer.current = window.setTimeout(() => {
            setFirstMessageEvents((current) => [...current, { kind: "started", ts: Date.now() } as AgentEvent]);
          }, 250);
        } : noop}
        onGoal={noop}
        eventsByThreadId={key === "claudeagents" || key === "finagents" ? AGENT_TRANSCRIPTS : undefined}
        linkedAgents={key === "claudeagents" || key === "finagents" ? BENCH_LINKED_SPECIALISTS : undefined}
        onOpenLinkedAgent={noop}
      />
    </div>
  );
}
