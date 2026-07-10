// ContextShelf (plan 015, slice 5 ; pilote 018 étape 5) : rangée de chips du
// contexte joint. Le markup riche d'origine est CONSERVÉ (vignettes image,
// groupes « ×N » + popover, suffixe lignes, aperçu au survol) ; seules les
// références simples (kind "file", sans lignes/aperçu — ce que produit le
// transfert depuis l'inspecteur) migrent vers la primitive ContextChip,
// avec source/type visibles. Tous les contrôles de suppression portent
// désormais un nom accessible.
import { useState } from "react";
import { t } from "../../lib/i18n";
import { CloseIcon } from "../icons";
import { ContextChip } from "../ui";
import { citeLabel } from "./turnParts";

export type ShelfAttachment = {
  name: string;
  lines: string | null;
  text: string;
  imageUrl?: string;
  kind?: string;
  preview?: { title: string; rows: { label: string; value: string }[] };
};

export function ContextShelf(p: {
  attachments: ShelfAttachment[];
  onRemoveAttachment: (index: number) => void;
  onOpenPaste: (paste: { name: string; text: string }) => void;
}) {
  const [openChipGroup, setOpenChipGroup] = useState<string | null>(null);
  if (p.attachments.length === 0) return null;
  return (
    <div className="chips-row">
      {p.attachments.map((a, i) => a.imageUrl ? (
        <div key={i} className="img-chip">
          <img src={a.imageUrl} alt={a.name} />
          <button type="button" className="img-chip-x" aria-label={`${t("action.close")} ${a.name}`}
            onClick={() => p.onRemoveAttachment(i)}>
            <CloseIcon />
          </button>
          <span className="img-chip-name">{a.name}</span>
        </div>
      ) : null)}
      {(() => {
        // grouper les citations par source : « Williamson…pdf ×3 » au lieu de 3 chips
        const groups: { name: string; idxs: number[]; first: ShelfAttachment }[] = [];
        p.attachments.forEach((a, i) => {
          if (a.imageUrl) return;
          const g = groups.find((x) => x.name === a.name);
          if (g) g.idxs.push(i); else groups.push({ name: a.name, idxs: [i], first: a });
        });
        return groups.map((g) => {
          const a = g.first;
          const many = g.idxs.length > 1;
          // référence simple (transfert inspecteur/palette) : primitive
          // ContextChip avec source/type — rien du markup riche n'est perdu
          // (pas de lignes, pas d'aperçu, pas de groupe sur ces entrées)
          if (!many && a.kind === "file" && !a.lines && !a.preview) {
            return (
              <ContextChip
                key={g.name}
                label={citeLabel(a.name)}
                kind={t("context.kind-file")}
                // source complète au survol (deux homonymes restent distinguables)
                title={a.text || a.name}
                onRemove={() => p.onRemoveAttachment(g.idxs[0])}
                removeLabel={`${t("action.close")} ${a.name}`}
              />
            );
          }
          return (
            <div key={g.name} className={`chip ${many ? "chip-grouped" : ""}`}>
              <svg className="chip-doc" width="11" height="13" viewBox="0 0 11 13" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
                <rect x="0.8" y="0.8" width="9.4" height="11.4" rx="1.6" />
                <path d="M3 4.4h5M3 6.8h5M3 9.2h3.4" />
              </svg>
              <span className="chip-label" title={a.name} onClick={() => {
                  if (many) setOpenChipGroup(openChipGroup === g.name ? null : g.name);
                  else if (a.kind === "paste") p.onOpenPaste({ name: a.name, text: a.text });
                }}
                style={many || a.kind === "paste" ? { cursor: "pointer" } : undefined}>
                {citeLabel(a.name)}
              </span>
              {many ? <span className="chip-count" onClick={() => setOpenChipGroup(openChipGroup === g.name ? null : g.name)}>×{g.idxs.length}</span>
                : a.lines && <span className="chip-lines">{t("chat.lines", { lines: a.lines })}</span>}
              {!many && a.preview && (
                <span className="chip-preview" role="tooltip">
                  <strong>{a.preview.title}</strong>
                  {a.preview.rows.map((row, j) => (
                    <span key={j} className="chip-preview-row">
                      <em>{row.label}</em>
                      <span>{row.value}</span>
                    </span>
                  ))}
                </span>
              )}
              <button type="button" className="ghost" aria-label={`${t("action.close")} ${g.name}`}
                onClick={() => {
                [...g.idxs].sort((x, y) => y - x).forEach((idx) => p.onRemoveAttachment(idx));
                setOpenChipGroup(null);
              }}>
                <CloseIcon />
              </button>
              {many && openChipGroup === g.name && (
                <div className="chip-group-pop">
                  {g.idxs.map((idx, k) => {
                    const it = p.attachments[idx];
                    return (
                      <div key={idx} className="cgp-row">
                        <span className="cgp-n">{k + 1}</span>
                        <span className="cgp-txt">{it.lines ? t("chat.lines", { lines: it.lines }) : (it.text || "").replace(/\s+/g, " ").slice(0, 60)}</span>
                        <button type="button" className="ghost" aria-label={`${t("action.close")} ${g.name} ${k + 1}`}
                          onClick={() => p.onRemoveAttachment(idx)}><CloseIcon /></button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        });
      })()}
    </div>
  );
}
