// Point de montage de la fenêtre de bienvenue (App, surcouches). Le dialogue
// n'est chargé qu'à sa première ouverture — jamais pour qui a déjà un agent
// prêt — puis reste monté pour que Base UI joue sa transition de sortie.
import { useState } from "react";
import { LazyBoundary, lazyWithRetry } from "../LazyBoundary";
import { useSetupWelcomeOpen } from "../../lib/setupEnvironment";

const SetupWelcomeDialog = lazyWithRetry(() => import("./SetupWelcomeDialog"));

export function SetupWelcomeHost() {
  const open = useSetupWelcomeOpen();
  const [loaded, setLoaded] = useState(open);
  if (open && !loaded) setLoaded(true);
  if (!loaded) return null;
  return (
    <LazyBoundary fallback={null}>
      <SetupWelcomeDialog open={open} />
    </LazyBoundary>
  );
}
