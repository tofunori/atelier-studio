// Sonde jetable (lot A, tâche 1) : établit comment Base UI signale la raison
// d'une fermeture, et si `cancel()` sur eventDetails annule réellement la
// fermeture au clavier. SUPPRIMÉE à la fin de la tâche 2.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { renderUi, resetTestState } from "../../test/render";
import { Dialog, DialogContent } from "../shadcn/dialog";

describe("sonde Base UI", () => {
  it("expose la raison de fermeture à onOpenChange (forme des arguments)", () => {
    resetTestState();
    const onOpenChange = vi.fn();
    renderUi(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <input aria-label="champ" />
        </DialogContent>
      </Dialog>,
    );
    fireEvent.keyDown(screen.getByLabelText("champ"), { key: "Escape" });

    expect(onOpenChange).toHaveBeenCalled();
    const [open, eventDetails] = onOpenChange.mock.calls[0];
    console.log("NB ARGS:", onOpenChange.mock.calls[0].length);
    console.log("open:", open);
    console.log("eventDetails.reason:", eventDetails?.reason);
    console.log("eventDetails keys:", eventDetails ? Object.keys(eventDetails) : undefined);
    console.log("typeof eventDetails.cancel:", typeof eventDetails?.cancel);
  });

  it("cancel() sur eventDetails empêche-t-il réellement la fermeture ?", () => {
    resetTestState();
    let open = true;
    const setOpen = (v: boolean) => {
      open = v;
    };
    function Probe() {
      return (
        <Dialog
          open={open}
          onOpenChange={(next, eventDetails) => {
            // On annule systématiquement la fermeture pour voir si Base UI
            // respecte cancel() côté comportement observable (le composant
            // reste-t-il ouvert après un re-render avec le même `open`?).
            eventDetails.cancel();
            console.log("APRES cancel() -> isCanceled:", eventDetails.isCanceled);
            setOpen(next); // on simule quand même un état contrôlé naïf pour voir l'effet
          }}
        >
          <DialogContent>
            <input aria-label="champ2" />
          </DialogContent>
        </Dialog>
      );
    }
    renderUi(<Probe />);
    fireEvent.keyDown(screen.getByLabelText("champ2"), { key: "Escape" });
    console.log("open (variable JS locale) après Échap:", open);
  });

  it("le vrai mécanisme d'annulation : ne pas appliquer next dans un composant contrôlé par React state", () => {
    resetTestState();
    function Probe() {
      const [open, setOpen] = useState(true);
      const [blockClose, setBlockClose] = useState(true);
      return (
        <Dialog
          open={open}
          onOpenChange={(next, eventDetails) => {
            if (!next && eventDetails.reason === "escape-key" && blockClose) {
              // On annule : on informe Base UI (cancel) ET on N'APPLIQUE PAS
              // le changement d'état contrôlé -> le dialogue reste ouvert.
              eventDetails.cancel();
              return;
            }
            setOpen(next);
          }}
        >
          <DialogContent>
            <input aria-label="champ3" />
            <button
              type="button"
              onClick={() => setBlockClose(false)}
            >
              débloquer
            </button>
          </DialogContent>
        </Dialog>
      );
    }
    renderUi(<Probe />);

    // 1er Échap : bloqué -> le champ (donc le dialogue) doit rester au DOM.
    fireEvent.keyDown(screen.getByLabelText("champ3"), { key: "Escape" });
    console.log(
      "après 1er Échap (bloqué), champ3 toujours présent ?",
      screen.queryByLabelText("champ3") !== null,
    );
    expect(screen.queryByLabelText("champ3")).not.toBeNull();

    // On débloque, puis on refait Échap : cette fois ça doit fermer.
    fireEvent.click(screen.getByText("débloquer"));
    fireEvent.keyDown(screen.getByLabelText("champ3"), { key: "Escape" });
    console.log(
      "après 2e Échap (débloqué), champ3 toujours présent ?",
      screen.queryByLabelText("champ3") !== null,
    );
    expect(screen.queryByLabelText("champ3")).toBeNull();
  });
});
