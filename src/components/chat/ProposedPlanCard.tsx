import { useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { t } from "../../lib/i18n";
import type { AgentEvent } from "../../lib/ws";
import { wsSend } from "../../lib/wsBus";
import { Tick } from "./toolPresentation";
import { Button, IconButton } from "../ui";

type PlanEvent = Extract<AgentEvent, { kind: "proposed_plan" }>;

function planTitle(markdown: string): string {
  const heading = markdown.split(/\r?\n/).find((line) => /^#{1,3}\s+\S/.test(line));
  return heading?.replace(/^#{1,3}\s+/, "").trim() || t("plan.title");
}

function planFileName(markdown: string): string {
  const stem = planTitle(markdown)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `${stem || "plan"}.md`;
}

export function ProposedPlanCard({ event, threadId }: { event: PlanEvent; threadId: string | null }) {
  const lines = useMemo(() => event.markdown.split(/\r?\n/), [event.markdown]);
  const collapsible = event.markdown.length > 900 || lines.length > 20;
  const [expanded, setExpanded] = useState(!collapsible);
  const [status, setStatus] = useState("");
  const markdown = expanded || !collapsible ? event.markdown : lines.slice(0, 10).join("\n");
  const fileName = event.fileName || planFileName(event.markdown);

  const sendSave = (payload: Record<string, unknown>) => {
    const sent = wsSend({ threadId, planId: event.planId, markdown: event.markdown, ...payload });
    setStatus(sent ? t("plan.saved") : t("plan.unavailable"));
  };

  return (
    <section className="proposed-plan" data-testid="proposed-plan-card">
      <header className="proposed-plan-head">
        <span className="proposed-plan-badge">{t("plan.badge")}</span>
        <span className="proposed-plan-title">{planTitle(event.markdown)}</span>
        {collapsible ? (
          <IconButton className="proposed-plan-expand" aria-expanded={expanded}
            label={expanded ? t("plan.collapse") : t("plan.expand")}
            onClick={() => setExpanded((value) => !value)}>
            <Tick open={expanded} />
          </IconButton>
        ) : null}
      </header>
      <div className={`proposed-plan-body${!expanded && collapsible ? " is-preview" : ""}`}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </div>
      <footer className="proposed-plan-actions">
        <Button variant="ghost" onClick={async () => {
          try {
            await navigator.clipboard.writeText(event.markdown);
            setStatus(t("plan.copied"));
          } catch {
            setStatus(t("plan.unavailable"));
          }
        }}>{t("action.copy")}</Button>
        <Button variant="secondary" onClick={() => sendSave({ type: "savePlan", fileName })}>
          {t("plan.save-project")}
        </Button>
        <Button variant="secondary" onClick={async () => {
          const path = await save({ defaultPath: fileName, filters: [{ name: "Markdown", extensions: ["md"] }] });
          if (typeof path === "string") sendSave({ type: "exportPlan", path });
        }}>{t("plan.export")}</Button>
        {status ? <span className="proposed-plan-status" role="status">{status}</span> : null}
      </footer>
    </section>
  );
}
