// Tests Tooltip + Menu + Popover (matrice plan 016) : délai 420 ms et hover
// rapide sans apparition, Escape avec retour focus, flèches avec cycle et
// items désactivés sautés, clic extérieur, aucun double événement après
// remontage (cleanup des listeners document et des timers).
// NB : fireEvent.mouseOver/mouseOut (bulles) — React synthétise enter/leave
// depuis mouseover/mouseout délégués ; mouseEnter ne bulle pas jusqu'à la racine.
import { useRef, useState } from "react";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  Tooltip,
  TOOLTIP_DELAY_MS,
  Menu,
  MenuItem,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  IconButton,
} from "./index";

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

/* fixture Menu réaliste : une ancre-toggle + trois items */
function MenuFixture(props: { onSelect?: () => void; onClose?: () => void; disableBeta?: boolean }) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={anchorRef} onClick={() => setOpen((o) => !o)}>
        ouvrir
      </button>
      <Menu
        open={open}
        onClose={() => {
          setOpen(false);
          props.onClose?.();
        }}
        anchorRef={anchorRef}
        label="Actions"
      >
        <MenuItem onSelect={props.onSelect}>Alpha</MenuItem>
        <MenuItem disabled={props.disableBeta}>Beta</MenuItem>
        <MenuItem selected>Gamma</MenuItem>
      </Menu>
    </>
  );
}

describe("Menu", () => {
  it("fermé : rien dans le DOM ; ouvert : rôle menu et focus sur le premier item", () => {
    render(<MenuFixture />);
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ouvrir" }));
    expect(screen.getByRole("menu", { name: "Actions" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Alpha" })).toHaveFocus();
  });

  it("flèches : descente, cycle, Home/End ; l'item désactivé est sauté", () => {
    render(<MenuFixture disableBeta />);
    fireEvent.click(screen.getByRole("button", { name: "ouvrir" }));
    const menu = screen.getByRole("menu");
    const alpha = screen.getByRole("menuitem", { name: "Alpha" });
    const gamma = screen.getByRole("menuitemradio", { name: "Gamma" });

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(gamma).toHaveFocus(); // Beta désactivé → sauté
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(alpha).toHaveFocus(); // cycle
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(gamma).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Home" });
    expect(alpha).toHaveFocus();
    fireEvent.keyDown(menu, { key: "End" });
    expect(gamma).toHaveFocus();
  });

  it("sélection : onSelect une fois, fermeture, focus rendu à l'ancre", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<MenuFixture onSelect={onSelect} onClose={onClose} />);
    const anchor = screen.getByRole("button", { name: "ouvrir" });
    fireEvent.click(anchor);
    fireEvent.click(screen.getByRole("menuitem", { name: "Alpha" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(anchor).toHaveFocus();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Escape ferme et rend le focus à l'ancre ; clic extérieur ferme ; mousedown sur l'ancre laisse le toggle décider", () => {
    const onClose = vi.fn();
    render(<MenuFixture onClose={onClose} />);
    const anchor = screen.getByRole("button", { name: "ouvrir" });

    fireEvent.click(anchor);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(anchor).toHaveFocus();

    fireEvent.click(anchor); // rouvre
    fireEvent.mouseDown(anchor); // guard : pas de fermeture par le listener document
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(document.body); // extérieur → ferme
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("l'item selected expose menuitemradio coché ; aucun double événement après fermeture/réouverture", () => {
    const onSelect = vi.fn();
    render(<MenuFixture onSelect={onSelect} />);
    const anchor = screen.getByRole("button", { name: "ouvrir" });

    fireEvent.click(anchor);
    expect(screen.getByRole("menuitemradio", { name: "Gamma" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("menuitem", { name: "Alpha" }));
    expect(onSelect).toHaveBeenCalledTimes(1);

    fireEvent.click(anchor); // réouverture
    fireEvent.click(screen.getByRole("menuitem", { name: "Alpha" }));
    expect(onSelect).toHaveBeenCalledTimes(2); // exactement +1, pas de listener doublé
  });

  it("après démontage, plus aucun listener document actif", () => {
    const onClose = vi.fn();
    const { unmount } = render(<MenuFixture onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "ouvrir" }));
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
