# Skills utilisables avec Kimi — expansion `/nom` côté Atelier

Approuvé par Thierry le 2026-07-18 (option 1 sur 3). Objectif : taper
`/annotation`, `/concis`, etc. dans un chat Kimi transmet réellement le
SKILL.md au harnais, au lieu d'envoyer du texte nu que Kimi ne sait pas
interpréter.

## Mécanisme

Le chemin provider existe déjà : `buildKimiPromptBlocks` (kimi.mjs:360,
kimi.rs:324) mappe un input `{type:"skill", name, path}` en
`resource_link file://` — il est juste inatteignable car gaté par
`capabilities.plugins` (false pour kimi, lookup câblé Codex). On le
débloque par un chemin dédié, sans toucher aux providers :

1. **Catalogue** — `sidecar/catalog.mjs` + `atelier-workspace/catalog.rs` :
   chaque entrée non-builtin gagne `path` (skill → `<dir>/<nom>/SKILL.md`
   si présent ; commande → `<dir>/<nom>.md`). Champ optionnel, wire
   rétro-compatible.
2. **Capability** — `skillsAttach?: boolean` (providers.ts,
   registry.mjs, atelier-protocol lib.rs). `true` pour kimi seulement :
   claude charge ses skills nativement (settingSources), codex a son
   chemin plugins, grok/opencode/gemini n'affichent pas le picker.
3. **Frontend (écrit une fois, sert aux 2 backends)** —
   `src/lib/skills.ts` : `catalogSkillForPrompt(prompt, commands)`
   matche un `/nom` en tête de prompt (hors builtins, entrée avec path) ;
   `skillAttachInstruction` produit la consigne « lis ce fichier et
   applique ses instructions ». Dans App.tsx (submit + flush de queue),
   si `capabilities.skillsAttach` : ajouter l'input structuré
   `{type:"skill"}` et suffixer la consigne au text input envoyé (le
   displayPrompt affiché reste propre).

Kimi reçoit donc : texte utilisateur + consigne + resource_link. La
divulgation progressive (fichiers référencés par le skill) marche via
les outils fichiers de Kimi. Invocation explicite seulement — pas
d'auto-déclenchement par description (option 2, hors scope).

## Hors scope

- Index des skills injecté au boot de session (option 2, v2 éventuelle).
- Conversion vers le format natif Kimi Code / exploitation de
  `available_commands_update` (option 3, rejetée : fragile).
- Codex et providers API : comportement inchangé.

## Tests

- Rust : `catalog.rs` (champ path), tests `build_prompt_blocks` existants.
- Sidecar : test catalogue (`listCommands` expose path).
- Frontend : test unitaire du helper ; `npx tsc --noEmit` + `npx vite build`.
- Parité live optionnelle : `sidecar/scripts/parity_kimi_send.mjs`.
