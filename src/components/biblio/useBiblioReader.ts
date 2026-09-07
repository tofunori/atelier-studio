// Lecteur de la surface Bibliothèque : ouverture du volet PDF, ouverture de la
// liste et largeur redimensionnable — tout l'état persistant vit ici, la
// surface ne fait plus que composer et rendre.
import { useCallback, useState } from "react";

const READER_KEY = "atelier-studio.biblio.reader";
const LIST_KEY = "atelier-studio.biblio.list";
const LIST_W_KEY = "atelier-studio.biblioListW";

export const LIST_W_MIN = 220;
export const LIST_W_MAX = 560;

export type BiblioReader = ReturnType<typeof useBiblioReader>;

export function useBiblioReader() {
  const [readerOpen, setReaderOpen] = useState(() => localStorage.getItem(READER_KEY) !== "0");
  const [listOpen, setListOpen] = useState(() => localStorage.getItem(LIST_KEY) !== "0");
  const [listW, setListW] = useState(() => {
    const v = Number(localStorage.getItem(LIST_W_KEY));
    return Number.isFinite(v) && v >= LIST_W_MIN && v <= LIST_W_MAX ? v : 300;
  });

  function toggleList() {
    setListOpen((v) => {
      localStorage.setItem(LIST_KEY, v ? "0" : "1");
      return !v;
    });
  }

  function toggleReader() {
    setReaderOpen((v) => {
      localStorage.setItem(READER_KEY, v ? "0" : "1");
      if (v && !listOpen) {
        localStorage.setItem(LIST_KEY, "1");
        setListOpen(true);
      }
      return !v;
    });
  }

  /** Ouverture idempotente — utilisée par les rattrapages de passage/sélection. */
  const openReader = useCallback(() => {
    setReaderOpen((v) => {
      if (v) return v;
      localStorage.setItem(READER_KEY, "1");
      return true;
    });
  }, []);

  function startListResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = listW;
    document.body.classList.add("dragging");
    const clamp = (ev: MouseEvent) =>
      Math.min(LIST_W_MAX, Math.max(LIST_W_MIN, startW + ev.clientX - startX));
    const move = (ev: MouseEvent) => setListW(clamp(ev));
    const up = (ev: MouseEvent) => {
      localStorage.setItem(LIST_W_KEY, String(clamp(ev)));
      document.body.classList.remove("dragging");
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  return { readerOpen, listOpen, listW, toggleList, toggleReader, openReader, startListResize };
}
