// SetBench (plan 021) — banc de captures DÉTERMINISTES de la page Réglages.
// Monté par main.tsx sur #setbench[-section] ; DEFAULT_SETTINGS, ws null
// (notice « sidecar déconnecté » stable). Aucune donnée personnelle.
import { useEffect, useMemo, useState } from "react";
import "../styles/tokens.css";
import "../styles/primitives.css";
import "../App.css";
// Bloc nav compacte/diagnostic/focus extrait vers un chunk lazy (perf lot 2,
// tâche 6) : le banc rend SettingsPage directement, hors SettingsSheet lazy,
// donc il doit l'importer lui-même (pas de budget de boot à préserver ici).
import "../styles/settings-sheet.css";
import SettingsPage from "./settings/SettingsPage";
import { DEFAULT_SETTINGS, type Settings } from "../lib/settings";
import { OPENCODE_BENCH_ROUTES } from "./settings/openCodeBenchRoutes";

const noop = () => {};

// Faux socket LOCAL au banc (une vingtaine de lignes plutôt qu'un import
// depuis src/test/) : la page Réglages n'attend qu'un objet qui expose
// readyState/send/addEventListener et qui lui répond un `providerStatus`.
// Variante #setbench-opencode : sert l'échantillon réel du catalogue
// opencode (openCodeBenchRoutes.ts) pour que le routeur du lot B2 soit
// visible au banc — sans sidecar, sans réseau, déterministe.
function benchSocket(): WebSocket {
  const target = new EventTarget();
  const reply = (payload: unknown) => {
    setTimeout(() => target.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(payload) }),
    ), 0);
  };
  const socket = {
    readyState: 1,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    send(raw: string) {
      const msg = JSON.parse(raw) as { type?: string };
      if (msg.type === "providerStatus") {
        reply({
          type: "providerStatus",
          providers: [
            { id: "claude", label: "Claude Code", version: "2.4.1", ok: true, kind: "cli",
              models: ["claude-opus-5", "claude-sonnet-5"], efforts: ["low", "medium", "high"] },
            { id: "opencode", label: "opencode", version: "0.16.2", ok: true, kind: "cli",
              models: OPENCODE_BENCH_ROUTES.map((r) => r.id), efforts: [],
              routes: OPENCODE_BENCH_ROUTES },
          ],
        });
      }
      if (msg.type === "setupStatus") {
        reply({ type: "setupStatus", providers: [
          { id: "claude", auth: "ready" }, { id: "opencode", auth: "ready" },
        ] });
      }
      if (msg.type === "apiProviders") reply({ type: "apiProviders", providers: [] });
    },
  };
  return socket as unknown as WebSocket;
}

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
  // #setbench-opencode : catalogue réel + réglages VIVANTS (épingler une
  // route doit se voir tout de suite, comme dans l'app), sinon la variante
  // historique reste figée sur DEFAULT_SETTINGS et un socket nul.
  const opencode = hash.includes("-opencode");
  const ws = useMemo(() => (opencode ? benchSocket() : null), [opencode]);
  const [live, setLive] = useState<Settings>({ ...DEFAULT_SETTINGS });
  return (
    <div style={{ height: "100vh", display: "flex", background: "var(--bg)", color: "var(--text-primary)" }}>
      {opencode ? (
        <SettingsPage
          settings={live}
          onChange={(patch) => setLive((prev) => ({ ...prev, ...patch }))}
          onClose={noop}
          ws={ws}
        />
      ) : (
        <SettingsPage settings={{ ...DEFAULT_SETTINGS }} onChange={noop} onClose={noop} ws={null} />
      )}
    </div>
  );
}
