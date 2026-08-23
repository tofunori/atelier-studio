// SetBench (plan 021) — banc de captures DÉTERMINISTES de la page Réglages.
// Monté par main.tsx sur #setbench[-section] ; DEFAULT_SETTINGS, ws null
// (notice « sidecar déconnecté » stable). Aucune donnée personnelle.
import { useEffect } from "react";
import "../styles/tokens.css";
import "../styles/primitives.css";
import "../App.css";
import SettingsPage from "./settings/SettingsPage";
import { DEFAULT_SETTINGS } from "../lib/settings";

const noop = () => {};

export function SetBench() {
  const hash = window.location.hash;
  useEffect(() => {
    // navigation de section pilotée par le hash pour les captures. La
    // section « Configuration » (setup) a fusionné dans « Modèles » (lot 1,
    // tâche 8) — le hash historique -setup vise donc désormais cette
    // section plutôt qu'un bouton de nav qui n'existe plus.
    const target = hash.includes("-setup") ? "Modèles" : null;
    if (!target) return;
    const btns = Array.from(document.querySelectorAll<HTMLButtonElement>(".set-nav-item"));
    btns.find((b) => (b.textContent ?? "").toLowerCase().includes("modèle") || (b.textContent ?? "").toLowerCase().includes("model"))?.click();
  }, [hash]);
  return (
    <div style={{ height: "100vh", display: "flex", background: "var(--bg)", color: "var(--text-primary)" }}>
      <SettingsPage settings={{ ...DEFAULT_SETTINGS }} onChange={noop} onClose={noop} ws={null} />
    </div>
  );
}
