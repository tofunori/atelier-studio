import React, { Suspense, lazy } from "react";
import { TooltipProvider } from "./Tooltip";

const Toaster = lazy(async () => {
  const module = await import("../shadcn/sonner");
  return { default: module.Toaster };
});

// Import d'article (plan 053) : monté ici et pas dans la surface
// Connaissances — une conversion MinerU dure des minutes et doit survivre à la
// fermeture du panneau comme au changement de conversation.
const ArticleDialog = lazy(() => import("../chat/ArticleDialog"));

/** Portails globaux montés une seule fois au-dessus de l'application. */
export function AppOverlays({ children }: React.PropsWithChildren) {
  return (
    <TooltipProvider>
      {children}
      <Suspense fallback={null}>
        <Toaster position="bottom-right" closeButton />
      </Suspense>
      <Suspense fallback={null}>
        <ArticleDialog />
      </Suspense>
    </TooltipProvider>
  );
}
