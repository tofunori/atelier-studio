// Tests Tooltip + menu ancré (DropdownMenuSurface/Base UI) + Popover (matrice
// plan 016) : délai 420 ms et hover rapide sans apparition, Escape avec retour
// focus, item désactivé inerte, clic extérieur, aucun double événement après
// remontage.
// NB : fireEvent.mouseOver/mouseOut (bulles) — React synthétise enter/leave
// depuis mouseover/mouseout délégués ; mouseEnter ne bulle pas jusqu'à la racine.
import { useState } from "react";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  Tooltip,
  TOOLTIP_DELAY_MS,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  IconButton,
} from "./index";
import { DropdownMenuSurface } from "./DropdownMenuSurface";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Tooltip", () => {
  const hover = (target: HTMLElement) => {
    const pointer = new MouseEvent("pointerover", { bubbles: true });
    Object.defineProperty(pointer, "pointerType", { value: "mouse" });
    fireEvent(target, pointer);
    fireEvent.mouseMove(target, { movementX: 2, movementY: 0 });
  };

  const setup = () => {
    vi.useFakeTimers();
    const utils = render(
      <Tooltip label="Réglages avancés">
        <button>cible</button>
      </Tooltip>,
    );
    return { ...utils, target: screen.getByRole("button", { name: "cible" }) };
  };

  it("conserve le délai produit et référence la cible via aria-describedby", () => {
    const { target } = setup();
    expect(TOOLTIP_DELAY_MS).toBe(420);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(target);
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Réglages avancés");
    expect(target).toHaveAttribute("aria-describedby", tip.id);
  });

  it("hover rapide entrée/sortie avant le délai : jamais affiché", () => {
    const { target } = setup();
    hover(target);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.mouseLeave(target);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("disparaît au blur et sur Escape ; s'affiche au focus clavier", () => {
    const { target } = setup();
    fireEvent.focus(target);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.focusOut(target, { relatedTarget: document.body });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(target).not.toHaveAttribute("aria-describedby");

    fireEvent.focus(target);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("démontage : timer nettoyé, aucune bulle fantôme", () => {
    const { target, unmount } = setup();
    hover(target);
    unmount();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });
});

/* fixture menu ancré réaliste : un déclencheur + trois items (Base UI) */
function MenuFixture(props: { onSelect?: () => void; onClose?: () => void; disableBeta?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenuSurface
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) props.onClose?.();
      }}
      label="Actions"
      trigger={<button type="button">ouvrir</button>}
      items={[
        { key: "alpha", label: "Alpha", onSelect: () => props.onSelect?.() },
        { key: "beta", label: "Beta", onSelect: () => {}, disabled: props.disableBeta },
        { key: "gamma", label: "Gamma", onSelect: () => {}, destructive: true, separatorBefore: true },
      ]}
    />
  );
}

describe("DropdownMenuSurface (menu ancré Base UI)", () => {
  it("fermé : rien dans le DOM ; ouvert : rôle menu, items et déclencheur aria-haspopup", async () => {
    render(<MenuFixture />);
    expect(screen.queryByRole("menu")).toBeNull();
    const trigger = screen.getByRole("button", { name: "ouvrir" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(trigger);
    // APG : le menu est nommé par son déclencheur (aria-labelledby posé par
    // Base UI sur le popup), pas par la prop label
    const menu = await waitFor(() => screen.getByRole("menu", { name: "ouvrir" }));
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("sélection : onSelect une fois, fermeture notifiée, menu retiré du DOM", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<MenuFixture onSelect={onSelect} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "ouvrir" }));
    const alpha = await waitFor(() => screen.getByRole("menuitem", { name: "Alpha" }));
    fireEvent.click(alpha);
    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape ferme et rend le focus au déclencheur", async () => {
    const onClose = vi.fn();
    render(<MenuFixture onClose={onClose} />);
    const trigger = screen.getByRole("button", { name: "ouvrir" });
    fireEvent.click(trigger);
    const menu = await waitFor(() => screen.getByRole("menu"));
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("item désactivé : exposé aria-disabled et inerte au clic", async () => {
    const onClose = vi.fn();
    render(<MenuFixture disableBeta onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "ouvrir" }));
    const beta = await waitFor(() => screen.getByRole("menuitem", { name: "Beta" }));
    expect(beta).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(beta);
    expect(screen.getByRole("menu")).toBeInTheDocument(); // pas de fermeture
    expect(onClose).not.toHaveBeenCalled();
  });

  it("item destructif : variante destructive exposée pour le style sémantique", async () => {
    render(<MenuFixture />);
    fireEvent.click(screen.getByRole("button", { name: "ouvrir" }));
    const gamma = await waitFor(() => screen.getByRole("menuitem", { name: "Gamma" }));
    expect(gamma).toHaveAttribute("data-variant", "destructive");
  });

  it("réouverture : aucun double événement", async () => {
    const onSelect = vi.fn();
    render(<MenuFixture onSelect={onSelect} />);
    const trigger = screen.getByRole("button", { name: "ouvrir" });

    fireEvent.click(trigger);
    fireEvent.click(await waitFor(() => screen.getByRole("menuitem", { name: "Alpha" })));
    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    fireEvent.click(trigger); // réouverture
    fireEvent.click(await waitFor(() => screen.getByRole("menuitem", { name: "Alpha" })));
    expect(onSelect).toHaveBeenCalledTimes(2); // exactement +1, pas de listener doublé
  });

  it("après démontage, plus aucun listener document actif", async () => {
    const onClose = vi.fn();
    const { unmount } = render(<MenuFixture onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "ouvrir" }));
    await waitFor(() => expect(screen.getByRole("menu")).toBeInTheDocument());
    unmount();
    const outsidePointer = new MouseEvent("pointerdown", { bubbles: true, button: 0 });
    Object.defineProperty(outsidePointer, "pointerType", { value: "mouse" });
    fireEvent(document.body, outsidePointer);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

function PopoverFixture(props: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) props.onClose?.();
    }}>
      <PopoverTrigger render={<button>régler</button>} />
      <PopoverContent aria-label="Effort">
        <PopoverHeader>
          <PopoverTitle>Effort</PopoverTitle>
          <PopoverDescription>Niveau de raisonnement</PopoverDescription>
        </PopoverHeader>
        <label>
          Niveau <input defaultValue="high" />
        </label>
      </PopoverContent>
    </Popover>
  );
}

describe("Popover", () => {
  it("ouvre un dialog non modal et place le focus dans son champ", async () => {
    render(<PopoverFixture />);
    fireEvent.click(screen.getByRole("button", { name: "régler" }));
    const dialog = screen.getByRole("dialog", { name: "Effort" });
    expect(dialog).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/Niveau/)).toHaveFocus());
    expect(dialog.querySelector('[data-slot="popover-title"]')).toHaveTextContent("Effort");
    expect(dialog.querySelector('[data-slot="popover-description"]')).toBeTruthy();
  });

  it("Escape ferme et rend le focus à l'ancre — y compris depuis un champ interne", async () => {
    render(<PopoverFixture />);
    const anchor = screen.getByRole("button", { name: "régler" });
    fireEvent.click(anchor);
    const input = screen.getByLabelText(/Niveau/);
    act(() => {
      input.focus();
    });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(anchor).toHaveFocus());
  });

  it("clic intérieur : reste ouvert ; le trigger referme", async () => {
    const onClose = vi.fn();
    render(<PopoverFixture onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "régler" }));
    fireEvent.click(screen.getByLabelText(/Niveau/));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "régler" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("compose avec IconButton (aria-expanded/haspopup passés par l'appelant)", async () => {
    function Composed() {
      const [open, setOpen] = useState(false);
      return (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger render={
            <IconButton label="Permissions">
              <svg viewBox="0 0 12 12" aria-hidden="true" />
            </IconButton>
          } />
          <PopoverContent aria-label="Permissions">
            <p>contenu</p>
          </PopoverContent>
        </Popover>
      );
    }
    render(<Composed />);
    const btn = screen.getByRole("button", { name: "Permissions" });
    expect(btn).toHaveAttribute("aria-haspopup", "dialog");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Permissions" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(btn).toHaveFocus());
  });
});
