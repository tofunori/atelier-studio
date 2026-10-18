// Réglages › Mémoire (chantier 3 du plan rattrapage-claude-science) : les
// deux interrupteurs, l'import des souvenirs de Claude Science projet par
// projet, et la liste des souvenirs à relire, corriger ou effacer. Le
// magasin vit côté Rust ; tout passe par `requete` (messages ws memory*).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Plus, Trash2 } from "lucide-react";
import type { SectionProps } from "../shared";
import type { Settings } from "../../../lib/settings";
import { t } from "../../../lib/i18n";
import {
  cibleParDefaut, demanderMemoire, libelleOrigine, messageErreur, nomDeProjet,
  type ProjetClaudeScience, type ReponseMemoire, type Souvenir,
} from "../../../lib/memoire";
import { Button, IconButton, InlineNotice, Select } from "../../ui";
import { Group, Row, Toggle } from "../primitives";
import { Input } from "../../shadcn/input";
import { Textarea } from "../../shadcn/textarea";
import "./Memoire.css";

const SOCKET_OPEN = 1;
const PAGE = 50;
/** Valeur du filtre « tous les souvenirs » (`""` = ceux de tous les projets). */
const TOUS = "*";
/** Cible d'import « ne pas importer ». */
const AUCUNE = "-";
/** « Tous les projets » dans les menus : la racine vide n'y est pas une
 *  valeur sûre, elle redevient `""` en sortant. */
const GLOBAL = "@tous";
const versMenu = (root: string) => (root === "" ? GLOBAL : root);
const depuisMenu = (v: string) => (v === GLOBAL ? "" : v);

export type Requete = (type: string, payload?: Record<string, unknown>) => Promise<ReponseMemoire>;

function dateCourte(iso: string) {
  return iso.slice(0, 10);
}

export function Memoire(p: {
  reglages: Settings["memoire"];
  onReglages: (memoire: Settings["memoire"]) => void;
  projets: string[];
  projetActif?: string;
  requete: Requete | null;
}) {
  // TOUS, GLOBAL ou une racine de projet
  const [filtre, setFiltre] = useState<string>(() => (p.projetActif ? p.projetActif : TOUS));
  const racineFiltre = depuisMenu(filtre);
  const [recherche, setRecherche] = useState("");
  const [items, setItems] = useState<Souvenir[]>([]);
  const [total, setTotal] = useState(0);
  const [compte, setCompte] = useState<Record<string, number>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [edition, setEdition] = useState<{ id: string | null; text: string } | null>(null);

  const charger = useCallback(async (offset = 0) => {
    if (!p.requete) return;
    const r = await p.requete("memoryList", {
      ...(filtre === TOUS ? {} : { projectRoot: racineFiltre }),
      query: recherche,
      offset,
      limit: PAGE,
    });
    if (!r.ok && r.error) { setErreur(messageErreur(r.error)); return; }
    setErreur(null);
    setItems((avant) => (offset === 0 ? r.items ?? [] : [...avant, ...(r.items ?? [])]));
    setTotal(r.total ?? 0);
    setCompte(r.counts ?? {});
  }, [p.requete, filtre, racineFiltre, recherche]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void charger(0); }, recherche ? 200 : 0);
    return () => window.clearTimeout(timer);
  }, [charger, recherche]);

  const projets = useMemo(() => {
    const tous = new Set(p.projets.filter(Boolean));
    Object.keys(compte).filter(Boolean).forEach((root) => tous.add(root));
    return [...tous].sort((a, b) => nomDeProjet(a).localeCompare(nomDeProjet(b)));
  }, [p.projets, compte]);

  const optionsFiltre = [
    { value: TOUS, label: t("memoire.filter-all") },
    { value: GLOBAL, label: `${t("memoire.all-projects")} · ${compte[""] ?? 0}` },
    ...projets.map((root) => ({ value: root, label: `${nomDeProjet(root)} · ${compte[root] ?? 0}` })),
  ];

  async function enregistrer() {
    if (!edition || !p.requete) return;
    const actuel = items.find((m) => m.id === edition.id);
    const r = await p.requete("memorySave", {
      memory: edition.id
        ? { id: edition.id, text: edition.text, projectRoot: actuel?.projectRoot }
        : { text: edition.text, projectRoot: filtre === TOUS ? (p.projetActif ?? "") : racineFiltre },
      origin: { kind: "manual" },
    });
    if (!r.ok) { setErreur(messageErreur(r.error)); return; }
    setEdition(null);
    void charger(0);
  }

  async function effacer(id: string) {
    if (!p.requete) return;
    const r = await p.requete("memoryDelete", { ids: [id] });
    if (!r.ok) { setErreur(messageErreur(r.error)); return; }
    setItems((avant) => avant.filter((m) => m.id !== id));
    setTotal((n) => Math.max(0, n - 1));
  }

  return (
    <div className="memoire-studio">
      <Group label={t("memoire.group-threads")}>
        <Row title={t("memoire.injection")} desc={t("memoire.injection-desc")}>
          <Toggle checked={p.reglages.injection} label={t("memoire.injection")}
            onChange={(injection) => p.onReglages({ ...p.reglages, injection })} />
        </Row>
        <Row title={t("memoire.extraction")} desc={t("memoire.extraction-desc")}>
          <Toggle checked={p.reglages.extraction} label={t("memoire.extraction")}
            onChange={(extraction) => p.onReglages({ ...p.reglages, extraction })} />
        </Row>
      </Group>

      <ImportClaudeScience projets={projets} requete={p.requete} onImporte={() => void charger(0)} />

      <Group label={t("memoire.group-list")}>
        <div className="memoire-liste">
          <div className="memoire-outils">
            <Select title={t("memoire.filter")} value={filtre} onChange={setFiltre} options={optionsFiltre} />
            <Input className="memoire-recherche" value={recherche} placeholder={t("memoire.search")}
              aria-label={t("memoire.search")} onChange={(e) => setRecherche(e.target.value)} />
            <Button variant="outline" disabled={!p.requete} onClick={() => setEdition({ id: null, text: "" })}>
              <Plus size={14} aria-hidden="true" />{t("memoire.add")}
            </Button>
          </div>
          {erreur && <InlineNotice tone="error" className="set-notice">{erreur}</InlineNotice>}
          {edition && edition.id === null && (
            <EditeurSouvenir texte={edition.text} onTexte={(text) => setEdition({ id: null, text })}
              onEnregistrer={enregistrer} onAnnuler={() => setEdition(null)} />
          )}
          <p className="memoire-total">{t("memoire.count", { n: total })}</p>
          {items.length === 0 && !edition && <p className="set-empty">{t("memoire.empty")}</p>}
          <ul className="memoire-items">
            {items.map((m) => (
              <li key={m.id} className="memoire-item">
                {edition?.id === m.id ? (
                  <EditeurSouvenir texte={edition.text} onTexte={(text) => setEdition({ id: m.id, text })}
                    onEnregistrer={enregistrer} onAnnuler={() => setEdition(null)} />
                ) : (
                  <>
                    <div className="memoire-item-corps">
                      <p className="memoire-item-texte">{m.text}</p>
                      <p className="memoire-item-meta">
                        <span>{libelleOrigine(m.origin)}</span>
                        <span className="memoire-item-date">{dateCourte(m.createdAt)}</span>
                        {filtre === TOUS && <span>{nomDeProjet(m.projectRoot)}</span>}
                        {m.edited && <span>{t("memoire.edited")}</span>}
                      </p>
                    </div>
                    <div className="memoire-item-actions">
                      <Button variant="ghost" onClick={() => setEdition({ id: m.id, text: m.text })}>{t("memoire.edit")}</Button>
                      <IconButton label={t("memoire.delete")} onClick={() => void effacer(m.id)}>
                        <Trash2 size={14} aria-hidden="true" />
                      </IconButton>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
          {items.length < total && (
            <Button variant="ghost" className="memoire-plus" onClick={() => void charger(items.length)}>
              {t("memoire.more", { n: total - items.length })}
            </Button>
          )}
        </div>
      </Group>
    </div>
  );
}

function EditeurSouvenir(p: { texte: string; onTexte: (t: string) => void; onEnregistrer: () => void; onAnnuler: () => void }) {
  return (
    <div className="memoire-editeur">
      <Textarea rows={3} value={p.texte} maxLength={2000} autoFocus aria-label={t("memoire.text")}
        placeholder={t("memoire.text-placeholder")} onChange={(e) => p.onTexte(e.target.value)} />
      <div className="memoire-editeur-actions">
        <Button variant="primary" disabled={!p.texte.trim()} onClick={p.onEnregistrer}>{t("memoire.save")}</Button>
        <Button variant="ghost" onClick={p.onAnnuler}>{t("common.cancel")}</Button>
      </div>
    </div>
  );
}

/** Import 3b : on lit les projets de Claude Science, puis l'utilisateur
 *  choisit pour chacun le projet d'Atelier qui reçoit ses souvenirs. */
function ImportClaudeScience(p: { projets: string[]; requete: Requete | null; onImporte: () => void }) {
  const [enCours, setEnCours] = useState(false);
  const [sources, setSources] = useState<ProjetClaudeScience[] | null>(null);
  const [cibles, setCibles] = useState<Record<string, string>>({});
  const [bilan, setBilan] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function lire() {
    if (!p.requete) return;
    setEnCours(true); setErreur(null); setBilan(null);
    const r = await p.requete("memoryClaudeSciencePreview");
    setEnCours(false);
    if (!r.ok) { setErreur(r.error ?? t("memoire.import-failed")); return; }
    const projets = r.projects ?? [];
    setSources(projets);
    setCibles(Object.fromEntries(projets.map((s) => {
      const cible = cibleParDefaut(s, p.projets);
      return [s.id, cible === null ? AUCUNE : versMenu(cible)];
    })));
  }

  async function importer() {
    if (!p.requete || !sources) return;
    const targets = sources
      .filter((s) => (cibles[s.id] ?? AUCUNE) !== AUCUNE)
      .map((s) => ({ projectId: s.id, projectRoot: depuisMenu(cibles[s.id]) }));
    if (targets.length === 0) return;
    setEnCours(true); setErreur(null);
    const r = await p.requete("memoryClaudeScienceImport", { targets });
    setEnCours(false);
    if (!r.ok) { setErreur(r.error ?? t("memoire.import-failed")); return; }
    const rapport = t("memoire.import-report", { added: r.added ?? 0, updated: r.updated ?? 0, unchanged: r.unchanged ?? 0 });
    p.onImporte();
    await lire();
    setBilan(rapport);
  }

  async function retirer(source: ProjetClaudeScience) {
    if (!p.requete) return;
    const r = await p.requete("memoryDelete", { importedFrom: source.name });
    if (!r.ok) { setErreur(r.error ?? t("memoire.import-failed")); return; }
    setBilan(t("memoire.import-removed", { n: r.removed ?? 0 }));
    p.onImporte();
    setSources((avant) => avant?.map((s) => (s.id === source.id ? { ...s, imported: 0, projectRoot: null } : s)) ?? null);
  }

  const options = [
    { value: AUCUNE, label: t("memoire.import-skip") },
    { value: GLOBAL, label: t("memoire.all-projects") },
    ...p.projets.map((root) => ({ value: root, label: nomDeProjet(root) })),
  ];
  const aImporter = sources?.some((s) => (cibles[s.id] ?? AUCUNE) !== AUCUNE) ?? false;

  return (
    <Group label={t("memoire.group-import")}>
      <div className="memoire-import">
        <div className="memoire-import-tete">
          <Button variant="outline" loading={enCours && !sources} disabled={!p.requete} onClick={lire}>
            <Download size={14} aria-hidden="true" />{sources ? t("memoire.import-reread") : t("memoire.import-read")}
          </Button>
          <span className="memoire-import-hint">{t("memoire.import-hint")}</span>
        </div>
        {erreur && <InlineNotice tone="error" className="set-notice">{erreur}</InlineNotice>}
        {sources && sources.length === 0 && <p className="set-empty">{t("memoire.import-none")}</p>}
        {sources && sources.length > 0 && (
          <>
            <ul className="memoire-import-projets">
              {sources.map((s) => (
                <li key={s.id || "sans-projet"} className="memoire-import-projet">
                  <div className="memoire-import-nom">
                    <span>{s.name || t("memoire.import-no-project")}</span>
                    <span className="memoire-import-compte">
                      {t("memoire.import-count", { n: s.count })}
                      {s.imported > 0 ? ` · ${t("memoire.import-already", { n: s.imported })}` : ""}
                    </span>
                  </div>
                  <Select title={t("memoire.import-target")} value={cibles[s.id] ?? AUCUNE}
                    onChange={(v) => setCibles((c) => ({ ...c, [s.id]: v }))} options={options} />
                  {s.imported > 0 && (
                    <Button variant="ghost" onClick={() => void retirer(s)}>{t("memoire.import-remove")}</Button>
                  )}
                </li>
              ))}
            </ul>
            <div className="memoire-import-pied">
              <Button variant="primary" loading={enCours} disabled={!aImporter} onClick={importer}>{t("memoire.import-run")}</Button>
              {bilan && <span role="status" className="memoire-import-bilan">{bilan}</span>}
            </div>
          </>
        )}
      </div>
    </Group>
  );
}

export default function MemoireSection(p: SectionProps) {
  const ws = p.ws;
  const requete = useMemo<Requete | null>(
    () => (ws && ws.readyState === SOCKET_OPEN ? (type, payload) => demanderMemoire(ws, type, payload) : null),
    [ws, ws?.readyState],
  );
  return (
    <>
      <h1>{t("settings.memoire")}</h1>
      <p className="set-sub">{t("settings.memoire-sub")}</p>
      <Memoire
        reglages={p.s.memoire}
        onReglages={(memoire) => { p.set({ memoire }); p.onSaved(); }}
        projets={p.projects ?? []}
        projetActif={p.projectRoot}
        requete={requete}
      />
    </>
  );
}
