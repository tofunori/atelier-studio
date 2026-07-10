// Tests Tooltip + Menu + Popover (matrice plan 016) : délai 420 ms et hover
// rapide sans apparition, Escape avec retour focus, flèches avec cycle et
// items désactivés sautés, clic extérieur, aucun double événement après
// remontage (cleanup des listeners document et des timers).
// NB : fireEvent.mouseOver/mouseOut (bulles) — React synthétise enter/leave
// depuis mouseover/mouseout délégués ; mouseEnter ne bulle pas jusqu'à la racine.
import { useRef, useState } from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { Tooltip, TOOLTIP_DELAY_MS, Menu, MenuItem, Popover, IconButton } from "./index";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Tooltip", () => {
  const setup = () => {
    vi.useFakeTimers();
    const utils = render(
      <Tooltip label="Réglages avancés">
        <button>cible</button>
      </Tooltip>,
    );
    return { ...utils, target: screen.getByRole("button", { name: "cible" }) };
  };

  it("n'apparaît qu'après le délai (420 ms), puis référence la cible via aria-describedby", () => {
    const { target } = setup();
    fireEvent.mouseOver(target.parentElement!);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY_MS - 1);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Réglages avancés");
    expect(target).toHaveAttribute("aria-describedby", tip.id);
  });

  it("hover rapide entrée/sortie avant le délai : jamais affiché", () => {
    const { target } = setup();
    const wrap = target.parentElement!;
    fireEvent.mouseOver(wrap);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.mouseOut(wrap);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("disparaît immédiatement à la sortie et sur Escape ; s'affiche aussi au focus clavier", () => {
    const { target } = setup();
    const wrap = target.parentElement!;
    fireEvent.mouseOver(wrap);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.mouseOut(wrap);
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(target).not.toHaveAttribute("aria-describedby");

    act(() => {
      target.focus();
    });
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("démontage : timer nettoyé, aucune bulle fantôme", () => {
    const { target, unmount } = setup();
    fireEvent.mouseOver(target.parentElement!);
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
    fireEvent.mouseDown(document.body);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

function PopoverFixture(props: { onClose?: () => void }) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={anchorRef} onClick={() => setOpen((o) => !o)}>
        régler
      </button>
      <Popover
        open={open}
        onClose={() => {
          setOpen(false);
          props.onClose?.();
        }}
        anchorRef={anchorRef}
        label="Effort"
      >
        <label>
          Niveau <input defaultValue="high" />
        </label>
      </Popover>
    </>
  );
}

describe("Popover", () => {
  it("ouvre un dialog non modal et lui donne le focus", () => {
    render(<PopoverFixture />);
    fireEvent.click(screen.getByRole("button", { name: "régler" }));
    const dialog = screen.getByRole("dialog", { name: "Effort" });
    expect(dialog).toHaveFocus();
  });

  it("Escape ferme et rend le focus à l'ancre — y compris depuis un champ interne", () => {
    render(<PopoverFixture />);
    const anchor = screen.getByRole("button", { name: "régler" });
    fireEvent.click(anchor);
    const input = screen.getByLabelText(/Niveau/);
    act(() => {
      input.focus();
    });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(anchor).toHaveFocus();
  });

  it("clic intérieur : reste ouvert ; clic extérieur : ferme", () => {
    const onClose = vi.fn();
    render(<PopoverFixture onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "régler" }));
    fireEvent.mouseDown(screen.getByLabelText(/Niveau/));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("compose avec IconButton (aria-expanded/haspopup passés par l'appelant)", () => {
    function Composed() {
      const wrapRef = useRef<HTMLDivElement | null>(null);
      const [open, setOpen] = useState(false);
      return (
        <>
          <div ref={wrapRef} style={{ display: "inline-flex" }}>
            <IconButton label="Permissions" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
              <svg viewBox="0 0 12 12" aria-hidden="true" />
            </IconButton>
          </div>
          <Popover open={open} onClose={() => setOpen(false)} anchorRef={wrapRef} label="Permissions">
            <p>contenu</p>
          </Popover>
        </>
      );
    }
    render(<Composed />);
    const btn = screen.getByRole("button", { name: "Permissions" });
    expect(btn).toHaveAttribute("aria-haspopup", "dialog");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Permissions" })).toBeInTheDocument();
    // ancre = div wrapper NON focusable : Escape doit rendre le focus au
    // bouton interne (régression vue au banc — focusAnchor descend dans l'ancre)
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(btn).toHaveFocus();
  });
});
