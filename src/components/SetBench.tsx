// SetBench (plan 021) — banc de captures DÉTERMINISTES de la page Réglages.
// Monté par main.tsx sur #setbench[-section] ; DEFAULT_SETTINGS, ws null
// (notice « sidecar déconnecté » stable). Aucune donnée personnelle.
import { useEffect } from "react";
import "../styles/tokens.css";
import "../styles/primitives.css";
import "../App.css";
import SettingsPage from "./Settings";
import { DEFAULT_SETTINGS } from "../lib/settings";

const noop = () => {};

export function SetBench() {
  const hash = window.location.hash;
  useEffect(() => {
    // navigation de section pilotée par le hash pour les captures
    const target = hash.includes("-setup") ? "Configuration" : null;
    if (!target) return;
    const btns = Array.from(document.querySelectorAll<HTMLButtonElement>(".set-nav-item"));
    btns.find((b) => (b.textContent ?? "").toLowerCase().includes("config") || (b.textContent ?? "").toLowerCase().includes("setup"))?.click();
  }, [hash]);
  return (
    <div style={{ height: "100vh", display: "flex", background: "var(--bg)", color: "var(--fg)" }}>
      <SettingsPage settings={{ ...DEFAULT_SETTINGS }} onChange={noop} onClose={noop} ws={null} />
    </div>
  );
}
