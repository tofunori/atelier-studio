// Calculs › Hôtes (chantier 4) : la fiche de chaque hôte (ressources, venvs,
// pièges, quotas) que l'agent lit avant d'écrire une tâche, et le réglage
// « Lancer sans demander ». Les fiches s'importent de Claude Science (sa base
// est lue sans être modifiée) puis s'éditent ici.
//
//   → computeHosts {requestId}                       ← computeHosts { hosts, error? }
//   → computeHostSave {requestId, host, notes?, autoLaunch?} ← idem
//   → computeHostsImport {requestId}                 ← idem + imported
import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { wsSend } from "../lib/wsBus";
import { Button } from "./ui/Button";
import { ScrollArea } from "./shadcn/scroll-area";
import { Switch } from "./shadcn/switch";
import { Textarea } from "./shadcn/textarea";

export type ComputeHostSheet = {
  host: "mac" | "nas" | "narval" | "rorqual";
  label: string;
  configured: boolean;
  notes: string;
  source?: string | null;
  updatedAt?: string | null;
  autoLaunch: boolean;
};

type HostsReply = { type: "computeHosts"; requestId?: string; hosts?: ComputeHostSheet[]; imported?: string[]; error?: string };

let requestSeq = 0;
const nextRequestId = () => `compute-hosts-${Date.now()}-${++requestSeq}`;

export function ComputeHostsView() {
  const [hosts, setHosts] = useState<ComputeHostSheet[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [savedHost, setSavedHost] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const pending = useRef(new Map<string, { kind: "load" | "save" | "import"; host?: string }>());

  const send = (payload: Record<string, unknown>, kind: "load" | "save" | "import", host?: string) => {
    const requestId = nextRequestId();
    pending.current.set(requestId, { kind, host });
    if (!wsSend({ ...payload, requestId })) {
      pending.current.delete(requestId);
      setNotice({ text: t("compute.unavailable"), error: true });
      if (kind === "import") setImporting(false);
    }
  };

  useEffect(() => {
    const onMessage = (event: Event) => {
      const msg = (event as CustomEvent<HostsReply>).detail;
      const request = msg?.requestId ? pending.current.get(msg.requestId) : undefined;
      if (!request) return;
      pending.current.delete(msg.requestId!);
      if (msg.hosts) setHosts(msg.hosts);
      if (request.kind === "import") {
        setImporting(false);
        // Une fiche importée remplace le brouillon de son hôte.
        setDrafts((current) => {
          const next = { ...current };
          for (const host of msg.imported ?? []) delete next[host];
          return next;
        });
      }
      if (msg.error) {
        setNotice({ text: msg.error, error: true });
      } else if (request.kind === "import") {
        const imported = new Set(msg.imported ?? []);
        const labels = (msg.hosts ?? []).flatMap((h) => (imported.has(h.host) ? [h.label] : []));
        setNotice({ text: labels.length ? t("compute.hosts-imported", { hosts: labels.join(", ") }) : t("compute.hosts-import-none") });
      } else if (request.kind === "save" && request.host) {
        setSavedHost(request.host);
        setDrafts((current) => {
          const next = { ...current };
          delete next[request.host!];
          return next;
        });
      }
    };
    window.addEventListener("compute-hosts", onMessage);
    return () => window.removeEventListener("compute-hosts", onMessage);
  }, []);

  // Lecture à l'ouverture de la vue (elle est remontée à chaque ouverture).
  useEffect(() => {
    const requestId = nextRequestId();
    pending.current.set(requestId, { kind: "load" });
    if (!wsSend({ type: "computeHosts", requestId })) {
      pending.current.delete(requestId);
      setNotice({ text: t("compute.unavailable"), error: true });
    }
  }, []);

  const importSheets = () => {
    setNotice(null);
    setImporting(true);
    send({ type: "computeHostsImport" }, "import");
  };

  return (
    <ScrollArea className="compute-hosts-scroll">
      <div className="compute-hosts">
        <div className="compute-hosts-intro">
          <p>{t("compute.hosts-intro")}</p>
          <Button variant="secondary" loading={importing} onClick={importSheets}>{t("compute.hosts-import")}</Button>
        </div>
        {notice ? <p className={`compute-hosts-notice${notice.error ? " is-error" : ""}`} role="status">{notice.text}</p> : null}
        {!hosts ? <p className="calculs-muted">{t("compute.hosts-loading")}</p> : hosts.map((sheet) => {
          const draft = drafts[sheet.host];
          const dirty = draft != null && draft !== sheet.notes;
          return (
            <section key={sheet.host} className="compute-host" data-host={sheet.host}>
              <header className="compute-host-head">
                <h2>{sheet.label}</h2>
                {!sheet.configured ? <span className="compute-host-meta">{t("compute.hosts-not-configured")}</span> : null}
                {sheet.source?.startsWith("claude-science") ? <span className="compute-host-meta">{t("compute.hosts-source")}</span> : null}
                <label className="compute-host-auto" title={t("compute.hosts-auto-hint")}>
                  <span>{t("compute.hosts-auto")}</span>
                  <Switch
                    checked={sheet.autoLaunch}
                    aria-label={`${t("compute.hosts-auto")} · ${sheet.label}`}
                    className={`switch ${sheet.autoLaunch ? "on" : ""}`}
                    onCheckedChange={(checked) => send({ type: "computeHostSave", host: sheet.host, autoLaunch: checked }, "save")}
                  />
                </label>
              </header>
              <Textarea
                className="compute-host-notes"
                value={draft ?? sheet.notes}
                placeholder={t("compute.hosts-placeholder")}
                aria-label={`${sheet.label} · ${t("compute.hosts-placeholder")}`}
                spellCheck={false}
                onChange={(event) => {
                  const value = event.target.value;
                  setSavedHost(null);
                  setDrafts((current) => ({ ...current, [sheet.host]: value }));
                }}
              />
              <footer className="compute-host-actions">
                {savedHost === sheet.host && !dirty ? <span className="compute-host-meta" role="status">{t("compute.hosts-saved")}</span> : null}
                <Button variant="secondary" disabled={!dirty}
                  onClick={() => send({ type: "computeHostSave", host: sheet.host, notes: draft }, "save", sheet.host)}>
                  {t("compute.hosts-save")}
                </Button>
              </footer>
            </section>
          );
        })}
      </div>
    </ScrollArea>
  );
}
