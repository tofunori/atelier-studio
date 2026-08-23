// Section Général (lot 1) : ex-« general » + ex-« avance » fusionnées. Les
// rangées sont migrées VERBATIM depuis Settings.tsx — ce lot ne redessine
// rien, il rend le redesign possible.
//
// Correction sur le gabarit du plan : la vraie section « avance »
// (Settings.tsx:1251-1290) contient le statut Sidecar, les images collées et
// le panneau Appareils distants — pas le format d'heure ni l'ordre des
// conversations (ces rangées vivent ailleurs : format d'heure dans
// « apparence » → tâche 6 ; ordre des fils est déjà dans le groupe
// Conversations ci-dessous, dans la partie essentielle de « general »).
import { useEffect, useState } from "react";
import { confirm as tauriConfirm } from "@tauri-apps/plugin-dialog";
import { Advanced, Group, Row, Toggle } from "../primitives";
import type { ProviderCatalogRow, SectionProps } from "../shared";
import type { Settings } from "../../../lib/settings";
import { setLanguage, t } from "../../../lib/i18n";
import { Select } from "../../Select";
import { Button, InlineNotice } from "../../ui";
import { Textarea } from "../../shadcn/textarea";
import { RemoteDevicesPanel } from "../../RemoteDevicesPanel";
import { CLAUDE_MODELS, modelLabel, providerModels } from "../models";

// Paliers d'effort — non dupliqués côté Models.tsx au sens du bug signalé
// (seul le catalogue de modèles désalignait les deux sections), donc pas
// déplacés ici.
const CLAUDE_EFFORTS = ["", "low", "medium", "high", "xhigh", "max"];
const CODEX_EFFORTS = ["", "low", "medium", "high", "xhigh"];

export default function General(p: SectionProps) {
  // Un seul point de sortie : toute écriture confirme (pastille « Enregistré »).
  const save = (patch: Partial<Settings>) => { p.set(patch); p.onSaved(); };
  const s = p.s;

  // État local des rangées « avance » (Sidecar, images collées) et du
  // re-titrage — déplacés depuis Settings.tsx avec les rangées qui les
  // consomment.
  const [status, setStatus] = useState<{ port: number | null; pastedCount: number; pasteDir: string } | null>(null);
  const [pasted, setPasted] = useState<{ name: string; size: number; mtime: number; dataURL?: string }[] | null>(null);
  const [retitleStatus, setRetitleStatus] = useState("");
  // Catalogue codex dynamique (providerStatus) — alimente le menu « Modèle
  // Codex par défaut » ci-dessous. Aussi consommé par Models.tsx (tâche 7) ;
  // deux abonnements indépendants au même type de message sont sans effet de
  // bord, chacun ne fait que dériver son propre état local.
  const [provs, setProvs] = useState<ProviderCatalogRow[] | null>(null);

  // Abonnement WebSocket : cette section n'écoute que les types de message
  // dont dépendent ses propres rangées (status, pastedCleared, pastedList,
  // retitleAllDone, providerStatus) et ignore les autres (apiProviders,
  // setupStatus, apiModels), qui partent dans Models.tsx à la tâche 7.
  //
  // Régression connue et assumée : dans l'ancien Settings.tsx, cet
  // abonnement vivait au niveau de la page entière, donc changer de section
  // pendant un « Générer les titres » gardait l'écouteur et affichait le
  // résultat au retour. Ici il vit dans General et meurt avec elle : si
  // l'utilisateur quitte General avant que le sidecar réponde
  // (retitleAllDone), l'opération aboutit quand même côté sidecar mais
  // `retitleStatus` ne s'affiche jamais — silencieux, sans erreur. Même
  // sort, plus bénin, pour `pastedCleared` (la liste des images collées ne
  // se rafraîchit pas si on a changé de section entre-temps). Remonter
  // l'abonnement dans la coquille violerait « la coquille ne connaît aucun
  // réglage » ; basculer le résultat vers un toast changerait le
  // comportement dans un lot qui l'interdit. Assumé tel quel.
  useEffect(() => {
    if (!p.ws || p.ws.readyState !== 1) return;
    const onMsg = (e: MessageEvent) => {
      const m = JSON.parse(e.data);
      if (m.type === "status") setStatus(m);
      if (m.type === "pastedCleared") {
        p.ws!.send(JSON.stringify({ type: "status" }));
        p.ws!.send(JSON.stringify({ type: "listPasted" }));
      }
      if (m.type === "pastedList") setPasted(m.files ?? []);
      if (m.type === "providerStatus") {
        const providers = Array.isArray(m.providers) ? m.providers : [];
        setProvs(providers.map((provider: ProviderCatalogRow) => ({
          ...provider,
          models: Array.isArray(provider?.models) ? provider.models : [],
          efforts: Array.isArray(provider?.efforts) ? provider.efforts : [],
        })));
      }
      if (m.type === "retitleAllDone") {
        setRetitleStatus(m.running ? t("settings.retitle-running") : t("settings.retitle-done", { count: m.renamed }));
      }
    };
    p.ws.addEventListener("message", onMsg);
    p.ws.send(JSON.stringify({ type: "status" }));
    p.ws.send(JSON.stringify({ type: "listPasted" }));
    p.ws.send(JSON.stringify({ type: "providerStatus" }));
    return () => p.ws?.removeEventListener("message", onMsg);
  }, [p.ws]);

  return (
    <>
      <h1>{t("settings.general")}</h1>
      <p className="set-sub">{t("settings.general-sub")}</p>

      {/* Settings.tsx:482-499 */}
      <Group>
        <Row title={t("language.label")}>
          <Select
            title={t("language.label")}
            value={s.language}
            onChange={(value) => {
              const language = value as Settings["language"];
              setLanguage(language);
              save({ language });
            }}
            options={[
              { value: "fr", label: t("language.fr") },
              { value: "en", label: t("language.en") },
              { value: "system", label: t("language.system") },
            ]}
          />
        </Row>
      </Group>

      {/* Settings.tsx:500-544 */}
      <Group label={t("settings.group.agents")}>
        <Row title={t("settings.default-provider")} desc={t("settings.default-provider-desc")}>
          <Select
            title={t("settings.default-provider")}
            value={s.defaultProvider}
            onChange={(value) => save({ defaultProvider: value as Settings["defaultProvider"] })}
            options={[
              { value: "claude", label: "Claude" },
              { value: "codex", label: "Codex" },
            ]}
          />
        </Row>
        <Row title={t("settings.default-claude-model")}>
          <Select
            title={t("settings.default-claude-model")}
            value={s.defaultModel.claude}
            onChange={(value) => save({ defaultModel: { ...s.defaultModel, claude: value } })}
            options={CLAUDE_MODELS.map((m) => ({ value: m.id, label: modelLabel(m) }))}
          />
        </Row>
        <Row title={t("settings.default-codex-model")}>
          <Select
            title={t("settings.default-codex-model")}
            value={s.defaultModel.codex}
            onChange={(value) => save({ defaultModel: { ...s.defaultModel, codex: value } })}
            options={providerModels("codex", provs, s.defaultModel).map((m) => ({ value: m.id, label: modelLabel(m) }))}
          />
        </Row>
        <Row title={t("settings.default-claude-effort")}>
          <Select
            title={t("settings.default-claude-effort")}
            value={s.defaultEffort.claude}
            onChange={(value) => save({ defaultEffort: { ...s.defaultEffort, claude: value } })}
            options={CLAUDE_EFFORTS.map((l) => ({ value: l, label: l === "" ? "auto" : l }))}
          />
        </Row>
        <Row title={t("settings.default-codex-effort")}>
          <Select
            title={t("settings.default-codex-effort")}
            value={s.defaultEffort.codex}
            onChange={(value) => save({ defaultEffort: { ...s.defaultEffort, codex: value } })}
            options={CODEX_EFFORTS.map((l) => ({ value: l, label: l === "" ? "auto" : l }))}
          />
        </Row>
      </Group>

      {/* Settings.tsx:545-566 */}
      <Group label={t("settings.group.tools")}>
        <Row title={t("settings.permission-default")} desc={t("settings.permission-default-desc")}>
          <Select
            title={t("settings.permission-default")}
            value={s.defaultPermissionMode}
            onChange={(value) => save({ defaultPermissionMode: value })}
            options={[
              { value: "bypassPermissions", label: t("permission.full") },
              { value: "acceptEdits", label: t("permission.accept-edits") },
              { value: "default", label: t("action.ask-default") },
              { value: "plan", label: t("permission.plan") },
            ]}
          />
        </Row>
        <Row title={t("settings.web-search")} desc={t("settings.web-search-desc")}>
          <Toggle label={t("settings.web-search")} checked={s.webSearch} onChange={(v) => save({ webSearch: v })} />
        </Row>
        <Row title={t("settings.additional-dirs")} desc={t("settings.additional-dirs-desc")}>
          <Textarea className="set-text" rows={3} value={s.additionalDirectories}
            onChange={(e) => save({ additionalDirectories: e.target.value })} />
        </Row>
      </Group>

      {/* Settings.tsx:567-592 */}
      <Group label={t("settings.group.conversations")}>
        <Row title={t("settings.thread-order")} desc={t("settings.thread-order-desc")}>
          <Select
            title={t("settings.thread-order")}
            value={s.threadOrder}
            onChange={(value) => save({ threadOrder: value as Settings["threadOrder"] })}
            options={[
              { value: "recent", label: t("settings.thread-order-recent") },
              { value: "manual", label: t("settings.thread-order-manual") },
            ]}
          />
        </Row>
        <Row title={t("settings.chat-titles")} desc={t("settings.chat-titles-desc")}>
          {retitleStatus && <InlineNotice tone="info" className="set-notice">{retitleStatus}</InlineNotice>}
          <Button
            className="set-btn"
            disabled={p.ws?.readyState !== 1}
            onClick={() => {
              setRetitleStatus(t("settings.running"));
              p.ws?.send(JSON.stringify({ type: "retitleAll" }));
            }}
          >
            {t("action.generate-chat-titles")}
          </Button>
        </Row>
      </Group>

      {/* Settings.tsx:1255-1289 (ex-« avance ») : Sidecar, images collées,
          appareils distants — trois rangées/groupes sous le repli. */}
      <Advanced count={3}>
        <Group>
          <Row title={t("settings.sidecar")} desc={status ? t("settings.sidecar-desc", { port: status.port }) : "…"}>
            <span className={`set-badge ${p.ws?.readyState === 1 ? "ok" : "ko"}`}>
              {p.ws?.readyState === 1 ? t("settings.connected") : t("settings.disconnected")}
            </span>
          </Row>
          <Row title={t("settings.pasted-images")} desc={status ? t("settings.pasted-images-desc", { count: status.pastedCount, dir: status.pasteDir }) : "…"}>
            <Button variant="ghost" className="set-btn quiet"
              onClick={async () => {
                const ok = await tauriConfirm(t("settings.clear-pasted-confirm"), { kind: "warning" }).catch(() => false);
                if (ok && p.ws?.readyState === 1) p.ws.send(JSON.stringify({ type: "clearPasted" }));
              }}>
              {t("action.clear")}
            </Button>
          </Row>
          {pasted && pasted.length > 0 && (
            <div className="pasted-grid">
              {pasted.map((f) => (
                <figure key={f.name} className="pasted-thumb" title={`${f.name} — ${(f.size / 1024).toFixed(0)} KB`}>
                  {f.dataURL ? (
                    <img src={f.dataURL} alt={f.name} loading="lazy" />
                  ) : (
                    <span className="pasted-ext">{f.name.split(".").pop()?.toUpperCase()}</span>
                  )}
                  <figcaption>{f.name}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </Group>
        <Group label={t("settings.remote-devices")}>
          <div style={{ padding: 12 }}>
            <RemoteDevicesPanel />
          </div>
        </Group>
      </Advanced>
    </>
  );
}
