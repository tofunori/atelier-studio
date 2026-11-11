// Réglages › Claude : le connecteur qui ouvre les projets LaTeX de ce Mac à
// claude.ai (éditeur de l'artefact, révisions, compilation). Atelier le lance
// lui-même (src-tauri/src/claude_connector.rs) ; cette page dit s'il tourne,
// l'adresse à donner à Claude, les dossiers ouverts, le code d'accès, et ce
// que Claude a fait en dernier. Tout passe par la commande Tauri
// `claude_connector_action`, qui répond l'état à jour.
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { t, type I18nKey } from "../../../lib/i18n";
import { Button, InlineNotice } from "../../ui";
import { Input } from "../../shadcn/input";
import { Group, Row, Toggle } from "../primitives";
import type { SectionProps } from "../shared";
import "./Claude.css";

export type ClaudeActivity = { t: number; tool: string; path?: string; ok?: boolean };

export type ClaudeStatus = {
  enabled?: boolean;
  running?: boolean;
  byAtelier?: boolean;
  roots?: string[];
  url?: string | null;
  home?: string | null;
  codeSet?: boolean;
  linked?: boolean;
  client?: string | null;
  linkedSince?: number | null;
  activity?: ClaudeActivity[];
};

export type ClaudeAction = (action: string, payload?: Record<string, unknown>) => Promise<ClaudeStatus>;

const tauriAction: ClaudeAction = (action, payload) =>
  invoke<ClaudeStatus>("claude_connector_action", { action, payload: payload ?? null });

/** Outils trop bavards pour le journal (une page de PDF = un appel). */
const QUIET = new Set(["render_pdf_page", "list_revisions"]);

const TIME = new Intl.DateTimeFormat("fr-CA", { hour: "2-digit", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short" });
const DATE = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric" });

export function shortPath(path: string, home?: string | null): string {
  return home && path.startsWith(home + "/") ? "~" + path.slice(home.length) : path;
}

function baseName(path: string): string {
  const parts = path.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || path;
}

/** « 18:42 » aujourd'hui, « 9 nov. · 18:42 » sinon. */
export function when(seconds: number, now = new Date()): string {
  const d = new Date(seconds * 1000);
  const time = TIME.format(d);
  return d.toDateString() === now.toDateString() ? time : `${DAY.format(d)} · ${time}`;
}

export function actionLabel(tool: string): string {
  const key = `settings.claude-act-${tool}` as I18nKey;
  const text = t(key);
  return text === key ? t("settings.claude-act-other", { tool }) : text;
}

function errorText(error: unknown): string {
  return typeof error === "string" ? error : error instanceof Error ? error.message : String(error);
}

export default function ClaudeSection(_p: SectionProps) {
  return <ClaudePanel />;
}

/** La page, avec une action injectable pour les tests. */
export function ClaudePanel(p: { action?: ClaudeAction }) {
  const action = p.action ?? tauriAction;
  const [status, setStatus] = useState<ClaudeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");

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

  async function addFolder() {
    const picked = await pickFolder({ directory: true, multiple: false }).catch(() => null);
    if (typeof picked === "string" && picked) await run("addRoot", { path: picked });
  }

  async function saveCode() {
    if (code.trim().length < 8) return;
    if (await run("setCode", { code: code.trim() }, t("settings.claude-code-saved"))) {
      setCode("");
      setCodeOpen(false);
    }
  }

  async function copyUrl() {
    if (!status?.url) return;
    try {
      await navigator.clipboard.writeText(status.url);
      setNotice(t("settings.claude-copied"));
    } catch {
      /* presse-papiers refusé : l'adresse reste sélectionnable */
    }
  }

  const head = (
    <>
      <h1>{t("settings.claude")}</h1>
      <p className="set-sub">{t("settings.claude-sub")}</p>
    </>
  );
  if (unavailable) return <>{head}<InlineNotice tone="info">{t("settings.claude-unavailable")}</InlineNotice></>;
  if (!status) return head;

  const enabled = !!status.enabled;
  const state = !enabled
    ? t("settings.claude-off")
    : status.running
      ? status.byAtelier ? t("settings.claude-running-atelier") : t("settings.claude-running-manual")
      : t("settings.claude-stopped");
  const roots = status.roots ?? [];
  const activity = (status.activity ?? []).filter((a) => !QUIET.has(a.tool)).slice(0, 8);

  return (
    <div className="claude-set">
      {head}
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      {notice && <InlineNotice tone="success">{notice}</InlineNotice>}

      <Group>
        <Row title={t("settings.claude-connector")} desc={state}>
          <span className={`claude-dot${enabled && status.running ? " on" : ""}`} aria-hidden="true" />
          <Toggle
            checked={enabled}
            label={t("settings.claude-connector")}
            onChange={(on) => void run("enable", { on })}
          />
        </Row>
      </Group>

      <Group label={t("settings.claude-access")}>
        <Row
          title={t("settings.claude-url")}
          desc={status.url ? t("settings.claude-url-desc") : t("settings.claude-url-missing")}
        >
          {status.url && (
            <>
              <code className="claude-url" title={status.url}>{status.url}</code>
              <Button variant="secondary" onClick={() => void copyUrl()}>{t("settings.claude-copy")}</Button>
            </>
          )}
        </Row>
      </Group>

      <Group label={t("settings.claude-folders")}>
        {roots.map((root) => (
          <Row key={root} title={baseName(root)} desc={shortPath(root, status.home)}>
            <Button
              variant="ghost"
              loading={busy === "removeRoot"}
              onClick={() => void run("removeRoot", { path: root })}
            >
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

      <Group label={t("settings.claude-security")}>
        <Row
          title={t("settings.claude-code")}
          desc={status.codeSet ? t("settings.claude-code-desc") : t("settings.claude-code-unset")}
        >
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
              onKeyDown={(e) => { if (e.key === "Enter") void saveCode(); if (e.key === "Escape") setCodeOpen(false); }}
            />
            <Button variant="primary" disabled={code.trim().length < 8} loading={busy === "setCode"} onClick={() => void saveCode()}>
              {t("settings.claude-code-save")}
            </Button>
            <Button variant="ghost" onClick={() => { setCode(""); setCodeOpen(false); }}>{t("settings.claude-cancel")}</Button>
          </div>
        )}
        <Row
          title={status.client || t("settings.claude-link")}
          desc={status.linked && status.linkedSince
            ? t("settings.claude-linked", { date: DATE.format(new Date(status.linkedSince * 1000)) })
            : t("settings.claude-unlinked")}
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

      <Group label={t("settings.claude-activity")}>
        {activity.length === 0 ? (
          <p className="claude-empty">{t("settings.claude-activity-none")}</p>
        ) : (
          <ul className="claude-activity">
            {activity.map((a, i) => (
              <li key={`${a.t}-${i}`}>
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
    </div>
  );
}
