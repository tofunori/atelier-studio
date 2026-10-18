// Carte d'un calcul proposé par l'agent (chantier 4 du plan
// rattrapage-claude-science) : hôte, script, ressources et coût estimé, puis
// « Lancer » ou « Refuser ». Rien ne part avant le clic, sauf pour un hôte
// réglé sur « Lancer sans demander ». Une fois lancée, la carte suit la
// tâche (en attente, en cours, terminée…) ; Annuler demande confirmation.
//
// Le clic n'envoie que l'identifiant de la tâche : le script lancé est celui
// que le serveur a enregistré et que la carte affiche.
import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { t } from "../../lib/i18n";
import type { AgentEvent, ComputeJobStatus } from "../../lib/ws";
import { wsSend } from "../../lib/wsBus";
import { Tick } from "./toolPresentation";
import { Button, IconButton, StatusBadge, type BadgeStatus } from "../ui";
import { Checkbox, CheckboxIndicator } from "../shadcn/checkbox";

export type ComputeJobEvent = Extract<AgentEvent, { kind: "compute_job" }>;

const SCRIPT_PREVIEW_LINES = 8;

function badgeStatus(status: ComputeJobStatus): BadgeStatus {
  switch (status) {
    case "launching":
    case "queued":
    case "running":
      return "running";
    case "completed":
      return "success";
    case "failed":
    case "launch_failed":
      return "error";
    case "proposed":
      return "warning";
    default:
      return "neutral";
  }
}

function statusLabel(event: ComputeJobEvent): string {
  if (event.status === "failed" && event.exitCode != null) {
    return t("compute.status-failed-code", { code: event.exitCode });
  }
  return t(`compute.status-${event.status}`);
}

function hours(value: number): string {
  return value >= 10 ? String(Math.round(value)) : String(Math.round(value * 10) / 10);
}

/** « 8 cœurs · 16G · 1:30:00 · def-x_cpu » */
function resourcesLine(job: NonNullable<ComputeJobEvent["job"]>): string {
  const r = job.resources ?? {};
  const parts: string[] = [];
  if (r.cpus) parts.push(t("compute.cpus", { count: r.cpus }));
  if (r.gpus) parts.push(t("compute.gpus", { count: r.gpus }));
  if (r.mem) parts.push(r.mem);
  if (r.time) parts.push(r.time);
  if (r.partition) parts.push(r.partition);
  if (r.account) parts.push(r.account);
  return parts.join(" · ");
}

function estimateLine(job: NonNullable<ComputeJobEvent["job"]>): string {
  const e = job.estimate ?? {};
  if (e.wallHours == null) return t("compute.estimate-none");
  const parts = [t("compute.estimate-cpu", { hours: hours(e.cpuHours ?? e.wallHours) })];
  if (e.gpuHours) parts.push(t("compute.estimate-gpu", { hours: hours(e.gpuHours) }));
  parts.push(t("compute.estimate-wall", { hours: hours(e.wallHours) }));
  return parts.join(" · ");
}

export function ComputeJobCard({ event }: { event: ComputeJobEvent }) {
  const job = event.job;
  const lines = useMemo(() => (job?.script ?? "").split(/\r?\n/), [job?.script]);
  // Avant le clic, le script se lit (aperçu, dépliable) ; ensuite il se
  // replie entièrement pour que la carte ne prenne plus de place dans le fil.
  const decided = event.status !== "proposed";
  const collapsible = decided || lines.length > SCRIPT_PREVIEW_LINES;
  const [expanded, setExpanded] = useState(false);
  const [always, setAlways] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [sent, setSent] = useState<"launch" | "refuse" | "cancel" | null>(null);
  const [error, setError] = useState("");

  // Un nouvel état venu du serveur clôt la demande en vol.
  useEffect(() => {
    setSent(null);
    setError("");
    if (event.status !== "queued" && event.status !== "running") setConfirmCancel(false);
  }, [event.status]);

  useEffect(() => {
    const onReply = (e: Event) => {
      const msg = (e as CustomEvent).detail as { jobId?: string; error?: string } | undefined;
      if (msg?.jobId !== event.jobId) return;
      setSent(null);
      setError(msg.error ? t("compute.error", { message: msg.error }) : "");
    };
    window.addEventListener("compute-job-decision", onReply);
    return () => window.removeEventListener("compute-job-decision", onReply);
  }, [event.jobId]);

  const decide = (decision: "launch" | "refuse" | "cancel") => {
    setError("");
    const ok = wsSend({ type: "computeJobDecision", jobId: event.jobId, decision, always: decision === "launch" && always });
    if (ok) setSent(decision);
    else setError(t("compute.unavailable"));
  };

  const host = job?.hostLabel ?? "";
  const live = event.status === "queued" || event.status === "running";
  const script = expanded || !collapsible ? job?.script ?? "" : lines.slice(0, SCRIPT_PREVIEW_LINES).join("\n");

  return (
    <section className="compute-job" data-testid="compute-job-card" data-status={event.status}>
      <header className="compute-job-head">
        <span className="compute-job-badge">{t("compute.badge")}</span>
        <span className="compute-job-title">{job?.label || t("compute.badge")}</span>
        <span className="compute-job-host">{t("compute.on-host", { host })}</span>
        <StatusBadge status={badgeStatus(event.status)} className="compute-job-state">{statusLabel(event)}</StatusBadge>
      </header>
      {job ? (
        <div className="compute-job-body">
          {job.purpose ? <p className="compute-job-purpose">{job.purpose}</p> : null}
          <dl className="compute-job-facts">
            <dt>{t("compute.workdir")}</dt>
            <dd className="compute-job-mono">{job.workDir}</dd>
            {resourcesLine(job) ? (
              <>
                <dt>{t("compute.resources")}</dt>
                <dd>{resourcesLine(job)}</dd>
              </>
            ) : null}
            <dt>{t("compute.estimate")}</dt>
            <dd>{estimateLine(job)}</dd>
            {event.remoteId ? (
              <>
                <dt>{t("compute.remote-id")}</dt>
                <dd className="compute-job-mono">{event.remoteId}</dd>
              </>
            ) : null}
          </dl>
          <div className="compute-job-script-head">
            <span>{t("compute.script")}</span>
            {collapsible ? (
              <IconButton className="compute-job-expand" aria-expanded={expanded}
                label={expanded ? t("compute.script-hide") : t("compute.script-show")}
                onClick={() => setExpanded((value) => !value)}>
                <Tick open={expanded} />
              </IconButton>
            ) : null}
          </div>
          {decided && !expanded ? null : (
            <pre className={`compute-job-script${!expanded && collapsible ? " is-preview" : ""}`}>{script}</pre>
          )}
        </div>
      ) : null}
      {event.message || error || event.auto ? (
        <p className={`compute-job-note${error || event.status === "launch_failed" || event.status === "failed" ? " is-error" : ""}`} role="status">
          {error || event.message || t("compute.auto")}
        </p>
      ) : null}
      {event.status === "proposed" ? (
        <footer className="compute-job-actions">
          <Button variant="primary" loading={sent === "launch"} disabled={sent !== null} onClick={() => decide("launch")}>
            {t("compute.launch")}
          </Button>
          <Button variant="ghost" disabled={sent !== null} onClick={() => decide("refuse")}>
            {t("compute.refuse")}
          </Button>
          <label className="compute-job-always">
            <Checkbox checked={always} aria-label={t("compute.always")} disabled={sent !== null}
              onCheckedChange={(value) => setAlways(Boolean(value))}>
              <CheckboxIndicator><Check size={12} strokeWidth={1.5} /></CheckboxIndicator>
            </Checkbox>
            <span>{t("compute.always")}</span>
          </label>
        </footer>
      ) : live ? (
        <footer className="compute-job-actions">
          {confirmCancel ? (
            <>
              <span className="compute-job-confirm">{t("compute.cancel-confirm", { host })}</span>
              <Button variant="danger" loading={sent === "cancel"} disabled={sent !== null} onClick={() => decide("cancel")}>
                {t("compute.cancel-yes")}
              </Button>
              <Button variant="ghost" disabled={sent !== null} onClick={() => setConfirmCancel(false)}>
                {t("compute.cancel-no")}
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmCancel(true)}>{t("compute.cancel")}</Button>
          )}
        </footer>
      ) : null}
    </section>
  );
}
