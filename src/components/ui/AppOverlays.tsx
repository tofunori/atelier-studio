import React, { Suspense, lazy } from "react";
import { TooltipProvider } from "./Tooltip";

const Toaster = lazy(async () => {
  const module = await import("../shadcn/sonner");
  return { default: module.Toaster };
});

/** Portails globaux montés une seule fois au-dessus de l'application. */
export function AppOverlays({ children }: React.PropsWithChildren) {
  return (
    <TooltipProvider>
      {children}
      <Suspense fallback={null}>
        <Toaster position="bottom-right" closeButton />
      </Suspense>
    </TooltipProvider>
  );
}
