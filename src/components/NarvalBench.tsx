// NarvalBench (redesign panneau) — banc de captures DÉTERMINISTE de la surface
// Narval à des largeurs de panneau réelles. Monté par main.tsx sur
// #nvbench[-light] avec VITE_VISUAL_BENCH=1 ; aucun sidecar requis : un faux
// socket répond aux requêtes narval* avec des fixtures figées.
import { useEffect, useState } from "react";
import "../styles/tokens.css";
import "../styles/primitives.css";
import "../App.css";
import NarvalSurface from "./NarvalSurface";
import { setWs } from "../lib/wsBus";
import { GripVerticalIcon, XIcon } from "lucide-react";
import { IconButton, RowButton } from "./ui";

const HOME = "/home/tofunori";

const ACTIVE = [
  { id: "65659188", name: "albedo-modis-tiles-2000-2025", state: "RUNNING", elapsed: "04:12:37", cpus: 32,
    partition: "cpubase_bycore_b1", reason: "None", workDir: `${HOME}/albedo/runs/m42a`,
    startedAt: "2026-08-23T04:51:00", endedAt: "" },
  { id: "65659204", name: "raqdps-mixed-model-M27", state: "PENDING", elapsed: "00:00", cpus: 16,
    partition: "cpularge_bycore_b1", reason: "Priority", workDir: `${HOME}/raqdps/M27`,
    startedAt: "", endedAt: "" },
];

const RECENT = [
  { id: "65651120", name: "albedo-trends-gf-dyn", state: "COMPLETED", elapsed: "02:41:09", cpus: 32,
    partition: "cpubase_bycore_b1", reason: "", workDir: `${HOME}/albedo/runs/trends`,
    startedAt: "2026-08-22T09:00:00", endedAt: "2026-08-22T11:41:09" },
  { id: "65648003", name: "raqdps-mixed-model-M26", state: "FAILED", elapsed: "00:07:44", cpus: 16,
    partition: "cpularge_bycore_b1", reason: "OUT_OF_MEMORY", workDir: `${HOME}/raqdps/M26`,
    startedAt: "2026-08-21T22:10:00", endedAt: "2026-08-21T22:17:44" },
  { id: "65640877", name: "modis-static-500m-rebuild", state: "COMPLETED", elapsed: "01:12:00", cpus: 8,
    partition: "cpubase_bycore_b1", reason: "", workDir: `${HOME}/albedo/static`,
    startedAt: "2026-08-20T14:00:00", endedAt: "2026-08-20T15:12:00" },
  { id: "65639410", name: "duckdb-region-merge", state: "CANCELLED", elapsed: "00:02:11", cpus: 4,
    partition: "cpubase_bycore_b1", reason: "", workDir: `${HOME}/albedo/duckdb`,
    startedAt: "2026-08-20T09:40:00", endedAt: "2026-08-20T09:42:11" },
];

const LOG = [
  "[04:51:02] tile 08/24 — MOD10A1 v6.1 · 2000-2025 · EPSG:3413",
  "[05:03:44] gf_dyn appliqué (fraction glaciaire dynamique, RGI 7.0)",
  "[06:20:11] export Drive → albedo_tiles_2026-08-23.csv (412 MB)",
  "[08:12:55] 18/24 tuiles terminées · 4h12 écoulées · ETA 1h30",
].join("\n");

function respond(message: any) {
  const { type, requestId, path, jobId, profile } = message;
  const cluster = profile === "rorqual" ? "rorqual" : "narval";
  const send = (data: unknown, responseType = type) =>
    window.dispatchEvent(new CustomEvent("narval-message", {
      detail: { type: responseType, requestId, path, data },
    }));
  if (type === "narvalStatus") {
    send({ profile: cluster, host: `${cluster}-vpn`, gateway: "nas", home: HOME,
      roots: [HOME, "/project/def-tofunori", "/scratch/tofunori"],
      connected: true, slurmAvailable: true, observedAtMs: 0 });
  }
  if (type === "narvalSnapshot") send({ active: ACTIVE, recent: RECENT, observedAtMs: 0 });
  if (type === "narvalListDirectory") {
    send([
      { name: "albedo", path: `${path}/albedo`, kind: "directory", size: 0, modifiedAt: 1_755_900_000 },
      { name: "raqdps", path: `${path}/raqdps`, kind: "directory", size: 0, modifiedAt: 1_755_800_000 },
      { name: "slurm-65659188.out", path: `${path}/slurm-65659188.out`, kind: "file", size: 18_244, modifiedAt: 1_755_930_000 },
      { name: "submit_albedo.sh", path: `${path}/submit_albedo.sh`, kind: "file", size: 1_902, modifiedAt: 1_755_700_000 },
    ], "narvalDirectory");
  }
  if (type === "narvalInspectJob") {
    const job = [...ACTIVE, ...RECENT].find((entry) => entry.id === jobId) ?? ACTIVE[0];
    send({ job, requestedMemory: "128 GB", submittedAt: "2026-08-23T04:50:12",
      stdoutPath: `slurm-${job.id}.out`, stderrPath: `slurm-${job.id}.err` }, "narvalJobDetail");
  }
  if (type === "narvalReadText") send({ path, content: LOG, truncated: false, observedAtMs: 0 }, "narvalText");
  if (type === "narvalRunFiles") {
    send({ jobId, workDir: `${HOME}/albedo/runs/m42a`,
      roots: [{ path: `${HOME}/albedo/runs/m42a/out`, source: "declared" }],
      entries: [
        { name: "albedo_tiles_2026-08-23.csv", path: `${HOME}/albedo/runs/m42a/out/albedo_tiles_2026-08-23.csv`,
          size: 432_000_000, modifiedAt: 1_755_930_000, attribution: "confirmed" },
        { name: "fit_summary.json", path: `${HOME}/albedo/runs/m42a/out/fit_summary.json`,
          size: 8_402, modifiedAt: 1_755_929_000, attribution: "probable" },
      ], truncated: false, observedAtMs: 0 });
  }
}

const FAKE_SOCKET = {
  readyState: 1,
  send(payload: string) {
    const message = JSON.parse(payload);
    queueMicrotask(() => respond(message));
  },
} as unknown as WebSocket;

// Le socket est injecté AVANT le premier rendu : la surface émet sa requête de
// statut dans son propre effet de montage, avant l'effet du parent.
setWs(FAKE_SOCKET);

const WIDTHS = [520, 720, 1040];

export function NarvalBench() {
  const light = window.location.hash.includes("-light");
  const [width, setWidth] = useState(
    Number(window.location.hash.match(/-w(\d+)/)?.[1]) || WIDTHS[0],
  );
  useEffect(() => {
    if (light) document.documentElement.setAttribute("data-theme", "light");
    // Pas de setWs(null) au démontage : StrictMode rejouerait l'effet avec un
    // socket nul et la surface basculerait en « service non connecté ».
    return () => document.documentElement.removeAttribute("data-theme");
  }, [light]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface-canvas)", padding: "var(--sp-5)",
      display: "flex", flexDirection: "column", gap: "var(--sp-4)", fontFamily: "var(--font-chrome)",
      color: "var(--text-primary)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
        {WIDTHS.map((value) => (
          <RowButton key={value} onClick={() => setWidth(value)}
            style={{ padding: "4px 10px", borderRadius: "var(--radius-control)",
              border: "1px solid var(--border-subtle)",
              background: value === width ? "var(--selection-surface)" : "transparent",
              color: "var(--text-secondary)", font: "var(--fs-label) var(--font-chrome)" }}>
            {value} px
          </RowButton>
        ))}
      </div>
      <div style={{ width, height: 720, display: "flex", overflow: "hidden",
        borderRadius: "var(--radius-surface)", border: "1px solid var(--border-subtle)",
        boxShadow: "var(--elevation-overlay)" }}>
        <NarvalSurface
          visible
          onOpenTerminal={() => {}}
          paneControls={(
            // Doublure des contrôles de pane (grip + fermeture) : même classe,
            // mêmes dimensions que dans AtelierPane.
            <div className="workspace-pane-controls is-integrated">
              <IconButton className="ghost" size="s" label="Déplacer le pane"><GripVerticalIcon /></IconButton>
              <IconButton className="ghost" size="s" label="Fermer le pane"><XIcon /></IconButton>
            </div>
          )}
        />
      </div>
    </div>
  );
}
