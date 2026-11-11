// Réglages › Claude : le connecteur qui ouvre les projets LaTeX de ce Mac à
// claude.ai (éditeur de l'artefact, révisions, compilation). Atelier le lance
// lui-même (src-tauri/src/claude_connector.rs) ; cette page dit s'il tourne,
// l'adresse à donner à Claude, les dossiers ouverts, le code d'accès, et ce
// que Claude a fait en dernier. Tout passe par la commande Tauri
// `claude_connector_action`, qui répond l'état à jour. Mise en forme et
// types : claudeFormat.ts.
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { t } from "../../../lib/i18n";
import { Button, InlineNotice } from "../../ui";
import { Input } from "../../shadcn/input";
import { Group, Row, Toggle } from "../primitives";
import type { SectionProps } from "../shared";
import {
  DATE,
  actionLabel,
  baseName,
  errorText,
  shortPath,
  visibleActivity,
  when,
  type ClaudeAction,
  type ClaudeStatus,
} from "./claudeFormat";
import "./Claude.css";

const tauriAction: ClaudeAction = (action, payload) =>
  invoke<ClaudeStatus>("claude_connector_action", { action, payload: payload ?? null });

/** Lance une action et garde l'état, l'erreur, la notice et l'action en cours. */
function useConnector(action: ClaudeAction) {
  const [status, setStatus] = useState<ClaudeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(async (name: string, payload?: Record<string, unknown>, done?: string) => {
    setBusy(name);
    setError(null);
    setNotice(null);
    try {
      setStatus(await action(name, payload));
      if (done) setNotice(done);
      return true;
    } catch (e) {
      if (name === "status" && !status) setUnavailable(true);
      else setError(errorText(e));
      return false;
    } finally {
      setBusy(null);
    }
  }, [action, status]);

  useEffect(() => { void run("status"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // État frais toutes les 10 s : dernières actions, connecteur relancé.
  useEffect(() => {
    if (unavailable) return;
    const timer = window.setInterval(() => {
      action("status").then(setStatus, () => {});
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [action, unavailable]);

  return { status, error, notice, setNotice, unavailable, busy, run };
}

type Run = ReturnType<typeof useConnector>["run"];

export default function ClaudeSection(_p: SectionProps) {
  return <ClaudePanel />;
}

/** La page, avec une action injectable pour les tests. */
export function ClaudePanel(p: { action?: ClaudeAction }) {
  const { status, error, notice, setNotice, unavailable, busy, run } = useConnector(p.action ?? tauriAction);

  const head = (
    <>
      <h1>{t("settings.claude")}</h1>
      <p className="set-sub">{t("settings.claude-sub")}</p>
    </>
  );
  if (unavailable) return <>{head}<InlineNotice tone="info">{t("settings.claude-unavailable")}</InlineNotice></>;
  if (!status) return head;

  return (
    <div className="claude-set">
      {head}
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      {notice && <InlineNotice tone="success">{notice}</InlineNotice>}
      <ConnectorGroup status={status} run={run} />
      <AccessGroup url={status.url} onCopied={() => setNotice(t("settings.claude-copied"))} />
      <FoldersGroup status={status} busy={busy} run={run} />
      <SecurityGroup status={status} busy={busy} run={run} />
      <ActivityGroup status={status} />
    </div>
  );
}

function ConnectorGroup({ status, run }: { status: ClaudeStatus; run: Run }) {
  const enabled = !!status.enabled;
  let state = t("settings.claude-off");
  if (enabled && !status.running) state = t("settings.claude-stopped");
  else if (enabled) state = status.byAtelier ? t("settings.claude-running-atelier") : t("settings.claude-running-manual");
  return (
    <Group>
      <Row title={t("settings.claude-connector")} desc={state}>
        <span className={`claude-dot${enabled && status.running ? " on" : ""}`} aria-hidden="true" />
        <Toggle checked={enabled} label={t("settings.claude-connector")} onChange={(on) => void run("enable", { on })} />
      </Row>
    </Group>
  );
}

function AccessGroup({ url, onCopied }: { url?: string | null; onCopied: () => void }) {
  async function copyUrl() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      onCopied();
    } catch {
      /* presse-papiers refusé : l'adresse reste sélectionnable */
    }
  }
  return (
    <Group label={t("settings.claude-access")}>
      <Row title={t("settings.claude-url")} desc={url ? t("settings.claude-url-desc") : t("settings.claude-url-missing")}>
        {url && (
          <>
            <code className="claude-url" title={url}>{url}</code>
            <Button variant="secondary" onClick={() => void copyUrl()}>{t("settings.claude-copy")}</Button>
          </>
        )}
      </Row>
    </Group>
  );
}

function FoldersGroup({ status, busy, run }: { status: ClaudeStatus; busy: string | null; run: Run }) {
  const roots = status.roots ?? [];
  async function addFolder() {
    const picked = await pickFolder({ directory: true, multiple: false }).catch(() => null);
    if (typeof picked === "string" && picked) await run("addRoot", { path: picked });
  }
  return (
    <Group label={t("settings.claude-folders")}>
      {roots.map((root) => (
        <Row key={root} title={baseName(root)} desc={shortPath(root, status.home)}>
          <Button variant="ghost" loading={busy === "removeRoot"} onClick={() => void run("removeRoot", { path: root })}>
            {t("settings.claude-remove")}
          </Button>
        </Row>
      ))}
      <Row
        title={roots.length ? t("settings.claude-add-folder") : t("settings.claude-folders-none")}
        desc={t("settings.claude-folders-desc")}
      >
        <Button variant="secondary" loading={busy === "addRoot"} onClick={() => void addFolder()}>
          {t("settings.claude-add-folder")}
        </Button>
      </Row>
    </Group>
  );
}

function SecurityGroup({ status, busy, run }: { status: ClaudeStatus; busy: string | null; run: Run }) {
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const close = () => { setCode(""); setCodeOpen(false); };
  async function saveCode() {
    if (code.trim().length < 8) return;
    if (await run("setCode", { code: code.trim() }, t("settings.claude-code-saved"))) close();
  }
  const linked = status.linked && status.linkedSince;
  return (
    <Group label={t("settings.claude-security")}>
      <Row title={t("settings.claude-code")} desc={status.codeSet ? t("settings.claude-code-desc") : t("settings.claude-code-unset")}>
        {!codeOpen && (
          <Button variant="secondary" onClick={() => setCodeOpen(true)}>
            {status.codeSet ? t("settings.claude-code-change") : t("settings.claude-code-choose")}
          </Button>
        )}
      </Row>
      {codeOpen && (
        <div className="claude-code">
          <Input
            type="password"
            autoFocus
            value={code}
            placeholder={t("settings.claude-code-placeholder")}
            aria-label={t("settings.claude-code")}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void saveCode(); if (e.key === "Escape") close(); }}
          />
          <Button variant="primary" disabled={code.trim().length < 8} loading={busy === "setCode"} onClick={() => void saveCode()}>
            {t("settings.claude-code-save")}
          </Button>
          <Button variant="ghost" onClick={close}>{t("settings.claude-cancel")}</Button>
        </div>
      )}
      <Row
        title={status.client || t("settings.claude-link")}
        desc={linked ? t("settings.claude-linked", { date: DATE.format(new Date(linked * 1000)) }) : t("settings.claude-unlinked")}
      >
        <Button
          variant="ghost"
          disabled={!status.linked}
          loading={busy === "disconnect"}
          onClick={() => void run("disconnect", undefined, t("settings.claude-disconnected"))}
        >
          {t("settings.claude-disconnect")}
        </Button>
      </Row>
    </Group>
  );
}

function ActivityGroup({ status }: { status: ClaudeStatus }) {
  const activity = visibleActivity(status.activity);
  return (
    <Group label={t("settings.claude-activity")}>
      {activity.length === 0 ? (
        <p className="claude-empty">{t("settings.claude-activity-none")}</p>
      ) : (
        <ul className="claude-activity">
          {activity.map((a) => (
            <li key={a.key}>
              <span className="claude-time">{when(a.t)}</span>
              <span className="claude-what">
                {actionLabel(a.tool)}
                {a.path && <span className="claude-file" title={a.path}>{baseName(a.path)}</span>}
              </span>
              {a.ok === false && <span className="claude-failed">{t("settings.claude-failed")}</span>}
            </li>
          ))}
        </ul>
      )}
    </Group>
  );
}
