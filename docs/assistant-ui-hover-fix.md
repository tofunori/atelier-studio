# assistant-ui : correctif traçable pour `Resource updated before mount`

Statut : correctif appliqué localement à `@assistant-ui/react@0.15.18` par
[`scripts/patch-assistant-ui-hover.mjs`](/Users/tofunori/Documents/atelier-studio/scripts/patch-assistant-ui-hover.mjs).
Le script est versionné, strictement gardé sur cette version et idempotent; le
hook `postinstall` le rejoue après une installation. Il ne modifie aucun
renderer Atelier.

## Reproduction observée

Dans le bench officiel (`tests/visual/assistant-ui.spec.ts`), laisser le
pointeur sur le bouton du groupe d’outils, recharger la page, puis attendre le
rendu du groupe produit deux fois l’erreur suivante dans Chromium :

```text
Error: Resource updated before mount
```

La trace passe par `dispatchOnFiber`, puis par le setter d’état du message et le
handler `HTMLDivElement`. Déplacer le pointeur hors du message juste avant le
rechargement supprime l’erreur, ce qui isole la fenêtre de montage et non le
contenu du scénario. Après le rechargement le bench perd l’interface de chat.

Le même bench confirme séparément que les scénarios d’attachement, de sélection
du modèle et de replay Codex/Claude passent avec la version actuelle.

## Cause établie dans les sources installées

`@assistant-ui/react@0.15.18` et le clone d’audit
(`@assistant-ui/assistant-ui`, commit `1a5da0f`) contiennent cette séquence dans
`packages/react/src/primitives/message/MessageRoot.tsx` :

```tsx
el.addEventListener("mouseenter", handleMouseEnter);
el.addEventListener("mouseleave", handleMouseLeave);

if (el.matches(":hover")) {
  queueMicrotask(() => message.setIsHovering(true));
}
```

Le handler `mouseenter` appelle aussi le setter immédiatement. Or
`@assistant-ui/tap` monte la fibre de ressource dans un `useEffect` passif
(`useResource.ts`), alors que le callback de ref DOM est exécuté pendant le
commit. Au rechargement, le navigateur peut donc envoyer `mouseenter` à la
nouvelle div avant le commit passif de la ressource. `dispatchOnFiber` rejette
alors la mise à jour d’une fibre encore marquée `isNeverMounted`.

Le délai seul n’est pas une garantie : dans une copie isolée du bundle,
remplacer uniquement le `queueMicrotask` initial par `setTimeout(0)` laisse le
crash provoqué par `mouseenter`. Différer les trois setters par timer supprime
le crash dans cette copie, mais l’ordre timer/effects n’est pas un contrat
React et ce n’est donc pas le correctif proposé.

Le mécanisme d’ordre existe déjà dans assistant-ui : `AuiProvider` rend
`MountTapEffects` avant ses enfants et documente ce choix. Les tests amont
`AuiProvider-config.test.tsx` (« runs the config client's effects ahead of
children's effects ») et `useTapHost.test.tsx` (« commits in the passive phase,
before the effects of a consumer ») vérifient respectivement l’ordre
`tap effect` puis `consumer effect`. `useLayoutEffect` serait trop tôt ; le
correctif doit utiliser le `useEffect` consommateur après ce commit.

## Diff appliqué par le script

Le diff suivant cible `packages/react/src/primitives/message/MessageRoot.tsx`.
Le script applique la même transformation à la source publiée, au bundle et à
la carte source quand elle est fournie :

```diff
 import {
   type ComponentRef,
   forwardRef,
   type ComponentPropsWithoutRef,
   type ForwardedRef,
   useCallback,
+  useEffect,
+  useRef,
 } from "react";
@@
 const useIsHoveringRef = () => {
   const aui = useAui();
   const message = useAuiState(() => aui.message);
+  const committedMessageRef = useRef<typeof message | null>(null);
+  const elementRef = useRef<HTMLElement | null>(null);
 
   const callbackRef = useCallback(
     (el: HTMLElement) => {
+      elementRef.current = el;
       const handleMouseEnter = () => {
-        message.setIsHovering(true);
+        if (committedMessageRef.current === message) {
+          message.setIsHovering(true);
+        }
       };
       const handleMouseLeave = () => {
-        message.setIsHovering(false);
+        if (committedMessageRef.current === message) {
+          message.setIsHovering(false);
+        }
       };
 
       el.addEventListener("mouseenter", handleMouseEnter);
       el.addEventListener("mouseleave", handleMouseLeave);
 
+      // A ref can be replaced while the client remains committed. In that
+      // case the effect below does not rerun, so synchronize this node here.
+      if (committedMessageRef.current === message) {
+        message.setIsHovering(el.matches(":hover"));
+      }
 
-      if (el.matches(":hover")) {
-        // TODO this is needed for SSR to work, figure out why
-        queueMicrotask(() => message.setIsHovering(true));
-      }
-
       return () => {
         el.removeEventListener("mouseenter", handleMouseEnter);
         el.removeEventListener("mouseleave", handleMouseLeave);
-        message.setIsHovering(false);
+        if (elementRef.current === el) elementRef.current = null;
       };
     },
     [message],
   );
+
+  useEffect(() => {
+    // AuiProvider's MountTapEffects commits tap before descendant effects.
+    committedMessageRef.current = message;
+    const el = elementRef.current;
+    if (el) message.setIsHovering(el.matches(":hover"));
+
+    return () => {
+      // Do not dispatch during ref/passive cleanup: the tap fiber may already
+      // be unmounted while React removes the DOM node.
+      if (committedMessageRef.current === message) {
+        committedMessageRef.current = null;
+      }
+    };
+  }, [message]);
 
   return useManagedRef(callbackRef);
 };
```

The effect synchronizes both initial states (`true` when the pointer is still
over the node and `false` otherwise) after the tap resource is mounted. Ref
cleanup never dispatches into a possibly unmounted resource. A replacement DOM
ref for the same committed client is synchronized in the ref callback; a new
client remains gated until its own effect commits. React StrictMode replay
clears and restores the client identity through the normal effect cycle.

## Validation réalisée

1. `src/lib/chat/assistantUiHover.test.tsx` monte le vrai
   `MessagePrimitive.Root` en `StrictMode`, envoie `mouseenter` depuis un
   effet de layout (avant les effets passifs), puis remplace le nœud avec le
   même client de message. Le test passe sans `Resource updated before mount`.
2. `scripts/patch-assistant-ui-hover.test.mjs` vérifie la garde de version et
   l’idempotence sur le paquet installé. La première application a modifié la
   source et le bundle; la seconde ne produit aucun changement.
3. `tests/visual/assistant-ui-hover.spec.ts` laisse le pointeur sur le bouton
   du groupe, recharge le bench officiel et capture `pageerror`; le test réel
   Playwright passe avec `errors === []` et le groupe fermé après reload.
4. Le build de banc `VITE_VISUAL_BENCH=1 npm run build:web`, le test hover
   Playwright (1/1) et la suite assistant-ui existante (4/4: pièces jointes,
   sélecteur, replay Codex/Claude) passent. Aucun lancement Tauri n’a été
   effectué.

Upstream context: [issue #2945](https://github.com/assistant-ui/assistant-ui/issues/2945)
reported the SSR hover race and [PR #2947](https://github.com/assistant-ui/assistant-ui/pull/2947)
(merged as `4db92c9`) changed the synchronous initial setter to a microtask.
That patch addresses the original SSR report but leaves the immediate
`mouseenter` path reproduced here; the identity gate closes both paths.
