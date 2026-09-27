// Section Intégrations : les services distants qu'Atelier peut joindre
// (Ragdoc, gbrain, NAS, grappes Slurm, Crossref, Zotero). Rien n'a de valeur
// par défaut — une intégration non remplie est désactivée, et aucune surface
// ne tente la moindre connexion SSH vers elle.
//
// Contrairement aux autres sections (réglages locaux enregistrés à chaque
// frappe), celle-ci écrit un fichier CÔTÉ SERVEUR que celui-ci valide : un
// brouillon local, un seul bouton Enregistrer qui envoie `saveIntegrations`
// avec la configuration entière, et le refus éventuel affiché tel quel. La
// réponse (message `integrations`) arrive par le store lib/integrations.
import { useEffect, useRef, useState } from "react";
import { Group, Row } from "../primitives";
import type { SectionProps } from "../shared";
import { t } from "../../../lib/i18n";
import {
  requestIntegrations,
  saveIntegrations,
  useIntegrations,
  type ClusterTarget,
  type IntegrationsConfig,
  type IntegrationsEffective,
} from "../../../lib/integrations";
import { Button, InlineNotice, Select, StatusBadge } from "../../ui";
import { Input } from "../../shadcn/input";

type GbrainMode = "off" | "local" | "ssh";

/** Brouillon du formulaire : un champ texte par réglage, vide = absent. */
export type IntegrationsDraft = {
  ragdocHost: string;
  ragdocRoot: string;
  gbrainMode: GbrainMode;
  gbrainHost: string;
  nasHost: string;
  clusterGateway: string;
  narval: string;
  rorqual: string;
  crossrefMailto: string;
  zoteroDir: string;
};

const str = (value: unknown) => (typeof value === "string" ? value : "");

export function draftFromConfig(config: IntegrationsConfig): IntegrationsDraft {
  const gbrain = config.gbrain;
  const gbrainHost = str(gbrain?.sshHost).trim();
  return {
    ragdocHost: str(config.ragdoc?.host),
    ragdocRoot: str(config.ragdoc?.root),
    gbrainMode: !gbrain ? "off" : gbrainHost ? "ssh" : "local",
    gbrainHost,
    nasHost: str(config.compute?.nasHost),
    clusterGateway: str(config.compute?.clusterGateway),
    narval: str(config.compute?.clusters?.narval),
    rorqual: str(config.compute?.clusters?.rorqual),
    crossrefMailto: str(config.crossrefMailto),
    zoteroDir: str(config.zoteroDir),
  };
}

/** Configuration envoyée au serveur : champs vides retirés, sections vides
 *  absentes. `ragdoc` part dès qu'un de ses deux champs est rempli — c'est au
 *  serveur de refuser un hôte sans dossier (et de le dire). */
export function configFromDraft(draft: IntegrationsDraft): IntegrationsConfig {
  const v = (value: string) => value.trim();
  const config: IntegrationsConfig = {};
  if (v(draft.ragdocHost) || v(draft.ragdocRoot)) {
    config.ragdoc = { host: v(draft.ragdocHost), root: v(draft.ragdocRoot) };
  }
  if (draft.gbrainMode === "local") config.gbrain = { sshHost: "" };
  if (draft.gbrainMode === "ssh") config.gbrain = { sshHost: v(draft.gbrainHost) };
  const compute: NonNullable<IntegrationsConfig["compute"]> = {};
  if (v(draft.nasHost)) compute.nasHost = v(draft.nasHost);
  if (v(draft.clusterGateway)) compute.clusterGateway = v(draft.clusterGateway);
  const clusters: { narval?: string; rorqual?: string } = {};
  if (v(draft.narval)) clusters.narval = v(draft.narval);
  if (v(draft.rorqual)) clusters.rorqual = v(draft.rorqual);
  if (Object.keys(clusters).length) compute.clusters = clusters;
  if (Object.keys(compute).length) config.compute = compute;
  if (v(draft.crossrefMailto)) config.crossrefMailto = v(draft.crossrefMailto);
  if (v(draft.zoteroDir)) config.zoteroDir = v(draft.zoteroDir);
  return config;
}

const SAVE_TIMEOUT_MS = 10_000;

function clusterDesc(target: ClusterTarget | null) {
  if (!target) return "";
  return target.gateway ? `${target.gateway} → ${target.host}` : target.host;
}

function zoteroSourceLabel(source: IntegrationsEffective["zoteroSource"]) {
  switch (source) {
    case "env": return t("settings.integrations-zotero-source-env");
    case "config": return t("settings.integrations-zotero-source-config");
    case "zotero-prefs": return t("settings.integrations-zotero-source-prefs");
    default: return t("settings.integrations-zotero-source-default");
  }
}

function ActiveBadge({ on }: { on: boolean }) {
  return (
    <StatusBadge status={on ? "success" : "neutral"}>
      {on ? t("settings.integrations-active") : t("settings.integrations-inactive")}
    </StatusBadge>
  );
}

export default function Integrations(p: SectionProps) {
  const integ = useIntegrations();
  const eff = integ.effective;
  const [draft, setDraft] = useState<IntegrationsDraft>(() => draftFromConfig(integ.config));
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  // Saisie en cours : un message `integrations` arrivé d'ailleurs (premier
  // message, reconnexion) ne doit pas écraser ce que l'utilisateur tape.
  const touched = useRef(false);
  const savingRef = useRef(false);
  const seen = useRef(integ);
  const connected = p.ws?.readyState === 1;

  // État frais à l'ouverture (dossier Zotero trouvé ou non, variables
  // d'environnement qui priment) — le store garde sinon la valeur du lancement.
  useEffect(() => { requestIntegrations(); }, []);

  useEffect(() => {
    if (seen.current === integ) return;
    seen.current = integ;
    if (savingRef.current) {
      savingRef.current = false;
      setSaving(false);
      if (integ.error) {
        setRefusal(integ.error);
        return;
      }
      setRefusal(null);
      touched.current = false;
      setDraft(draftFromConfig(integ.config));
      p.onSaved();
      return;
    }
    if (!touched.current) setDraft(draftFromConfig(integ.config));
  }, [integ]);

  useEffect(() => {
    if (!saving) return;
    const timer = window.setTimeout(() => { savingRef.current = false; setSaving(false); }, SAVE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [saving]);

  const edit = (patch: Partial<IntegrationsDraft>) => {
    touched.current = true;
    setRefusal(null);
    setDraft((current) => ({ ...current, ...patch }));
  };

  const baseline = JSON.stringify(configFromDraft(draftFromConfig(integ.config)));
  const next = configFromDraft(draft);
  const dirty = JSON.stringify(next) !== baseline;
  // « Par SSH » sans hôte enverrait `sshHost: ""`, c'est-à-dire « sur ce
  // Mac » : on bloque plutôt que d'enregistrer autre chose que ce qui est affiché.
  const invalid = draft.gbrainMode === "ssh" && !draft.gbrainHost.trim();

  function save() {
    if (saving || invalid || !connected) return;
    if (!saveIntegrations(next)) return;
    savingRef.current = true;
    setSaving(true);
    setRefusal(null);
  }

  // `label` = nom accessible : préfixé du service quand l'intitulé de rangée
  // (« Hôte SSH ») se répète d'un groupe à l'autre.
  const text = (key: keyof IntegrationsDraft, label: string, placeholder?: string) => (
    <Input
      className="set-text"
      aria-label={label}
      spellCheck={false}
      autoCapitalize="none"
      autoCorrect="off"
      value={draft[key] as string}
      placeholder={placeholder}
      onChange={(e) => edit({ [key]: e.target.value } as Partial<IntegrationsDraft>)}
    />
  );

  const gbrainDesc = eff.gbrain === "ssh"
    ? [t("settings.integrations-gbrain-ssh"), str(integ.config.gbrain?.sshHost)].filter(Boolean).join(" · ")
    : eff.gbrain === "local" ? t("settings.integrations-gbrain-local") : "";
  const zoteroStatus = t("settings.integrations-zotero-status", {
    path: eff.zoteroDir,
    source: zoteroSourceLabel(eff.zoteroSource),
  });

  return (
    <>
      <h1>{t("settings.integrations")}</h1>
      <p className="set-sub">{t("settings.integrations-sub")}</p>

      {!connected && (
        <InlineNotice tone="warning" className="set-notice">
          {t("settings.sidecar-disconnected-notice")}
        </InlineNotice>
      )}

      {/* Ce qui s'applique VRAIMENT (fichier + variables d'environnement +
          détection) — pas le brouillon ci-dessous. */}
      <Group label={t("settings.integrations-status")}>
        <Row title="Ragdoc" desc={eff.ragdoc && integ.config.ragdoc
          ? `${integ.config.ragdoc.host}:${integ.config.ragdoc.root}` : undefined}>
          <ActiveBadge on={eff.ragdoc} />
        </Row>
        <Row title="gbrain" desc={gbrainDesc || undefined}>
          <ActiveBadge on={eff.gbrain !== null} />
        </Row>
        <Row title={t("calculs.host-nas")} desc={eff.nasHost ?? undefined}>
          <ActiveBadge on={Boolean(eff.nasHost)} />
        </Row>
        <Row title="Narval" desc={clusterDesc(eff.clusters.narval) || undefined}>
          <ActiveBadge on={Boolean(eff.clusters.narval)} />
        </Row>
        <Row title="Rorqual" desc={clusterDesc(eff.clusters.rorqual) || undefined}>
          <ActiveBadge on={Boolean(eff.clusters.rorqual)} />
        </Row>
        <Row title="Crossref">
          <ActiveBadge on={eff.crossref} />
        </Row>
        <Row title="Zotero" desc={zoteroStatus}>
          <StatusBadge status={eff.zoteroFound ? "success" : "warning"}>
            {eff.zoteroFound ? t("settings.integrations-found") : t("settings.integrations-not-found")}
          </StatusBadge>
        </Row>
      </Group>

      <Group label="Ragdoc">
        <Row title={t("settings.integrations-ssh-host")} desc={t("settings.integrations-ragdoc-host-desc")}>
          {text("ragdocHost", `Ragdoc · ${t("settings.integrations-ssh-host")}`)}
        </Row>
        <Row title={t("settings.integrations-ragdoc-root")} desc={t("settings.integrations-ragdoc-root-desc")}>
          {text("ragdocRoot", `Ragdoc · ${t("settings.integrations-ragdoc-root")}`)}
        </Row>
      </Group>

      <Group label="gbrain">
        <Row title={t("settings.integrations-gbrain-mode")} desc={t("settings.integrations-gbrain-mode-desc")}>
          <Select
            title={t("settings.integrations-gbrain-mode")}
            value={draft.gbrainMode}
            onChange={(value) => edit({ gbrainMode: value as GbrainMode })}
            options={[
              { value: "off", label: t("settings.integrations-gbrain-off") },
              { value: "local", label: t("settings.integrations-gbrain-local") },
              { value: "ssh", label: t("settings.integrations-gbrain-ssh") },
            ]}
          />
        </Row>
        {draft.gbrainMode === "ssh" && (
          <Row title={t("settings.integrations-ssh-host")} desc={t("settings.integrations-gbrain-host-desc")}>
            {text("gbrainHost", `gbrain · ${t("settings.integrations-ssh-host")}`)}
          </Row>
        )}
      </Group>

      <Group label={t("settings.integrations-compute")}>
        <Row title={t("settings.integrations-nas")} desc={t("settings.integrations-nas-desc")}>
          {text("nasHost", t("settings.integrations-nas"))}
        </Row>
        <Row title={t("settings.integrations-gateway")} desc={t("settings.integrations-gateway-desc")}>
          {text("clusterGateway", t("settings.integrations-gateway"))}
        </Row>
        <Row title={t("settings.integrations-narval")} desc={t("settings.integrations-narval-desc")}>
          {text("narval", t("settings.integrations-narval"))}
        </Row>
        <Row title={t("settings.integrations-rorqual")} desc={t("settings.integrations-rorqual-desc")}>
          {text("rorqual", t("settings.integrations-rorqual"))}
        </Row>
      </Group>

      <Group label={t("settings.integrations-references")}>
        <Row title={t("settings.integrations-crossref")} desc={t("settings.integrations-crossref-desc")}>
          {text("crossrefMailto", t("settings.integrations-crossref"))}
        </Row>
        <Row title={t("settings.integrations-zotero")} desc={t("settings.integrations-zotero-desc")}>
          {text("zoteroDir", t("settings.integrations-zotero"), eff.zoteroDir)}
        </Row>
      </Group>

      {refusal && (
        <InlineNotice tone="error" className="set-notice">
          {t("settings.integrations-refused", { error: refusal })}
        </InlineNotice>
      )}
      <div className="set-headline">
        <p className="set-sub" role="status">
          {saving
            ? t("settings.integrations-saving")
            : dirty ? t("settings.integrations-unsaved") : t("settings.integrations-apply-note")}
        </p>
        <span className="set-headline-actions">
          <Button
            variant="primary"
            className="set-btn"
            disabled={!dirty || invalid || !connected}
            loading={saving}
            onClick={save}
          >
            {t("action.save")}
          </Button>
        </span>
      </div>
    </>
  );
}
