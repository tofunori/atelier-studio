// PromptInput (plan 015, slice 5) : liste de suggestions + zone de saisie
// (backdrop de pilules, textarea, raccourcis, IME). JSX déplacé verbatim depuis
// le composer de Chat.tsx — l'état (texte, suggestions) reste chez l'appelant.
import React, { type MutableRefObject } from "react";
import { t } from "../../lib/i18n";
import { FileTypeIcon } from "./toolPresentation";
import { mentionLabel, isValidSkill } from "./mentions";
import { InputGroupTextarea } from "../shadcn/input-group";

export type Suggestion = {
  label: string;
  insert: string;
  hint?: string;
  icon?: string;
  section?: string;
};

export function SuggestionsList(p: {
  suggestions: Suggestion[];
  selIdx: number;
  applySuggestion: (s: Suggestion) => void;
}) {
  const { suggestions, selIdx, applySuggestion } = p;
  return (
    <>
        {suggestions.length > 0 && (
          <ul className="suggest" role="listbox" aria-label="Suggestions">
            {suggestions.map((s, i) => (
              <React.Fragment key={s.insert + s.label}>
                {s.section && (i === 0 || suggestions[i - 1].section !== s.section) && (
                  <li className="suggest-section" role="presentation">{s.section}</li>
                )}
                <li
                  className={i === selIdx ? "sel" : ""}
                  role="option"
                  aria-selected={i === selIdx}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applySuggestion(s);
                  }}
                >
                  <span className="suggest-main">
                    {s.icon && <FileTypeIcon ext={s.icon} />}
                    <b>{s.label}</b>
                  </span>
                  {s.hint && <span className="hint">{s.hint}</span>}
                </li>
              </React.Fragment>
            ))}
          </ul>
        )}
    </>
  );
}

export function PromptTextarea(p: {
  text: string;
  setText: React.Dispatch<React.SetStateAction<string>>;
  taRef: MutableRefObject<HTMLTextAreaElement | null>;
  suggestions: Suggestion[];
  selIdx: number;
  setSelIdx: React.Dispatch<React.SetStateAction<number>>;
  applySuggestion: (s: Suggestion) => void;
  commands: { name: string; source: string }[];
  workingSince: number | null;
  disabled: boolean;
  onStop: () => void;
  onPasteImage: (dataURL: string) => void;
  onPasteText: (text: string) => void;
}) {
  const { text, setText, taRef, suggestions, selIdx, setSelIdx, applySuggestion } = p;
  return (
    <>
        <div className={`ta-wrap ${(() => {
          const m = /(^|\s)(\/[\w:-]+)/.exec(text);
          if (m && isValidSkill(m[2], p.commands)) return "slash-active";
          if (/(^|\s)@[\w./:-]+/.test(text)) return "slash-active";
          return "";
        })()}`}>
        <div className="ta-backdrop" data-not-typeset aria-hidden="true">
          {(() => {
            // pilules : /skill (début OU plein texte) et mentions @fichier
            const parts = text.split(/((?:^|\s)@[\w./:-]+|(?:^|\s)\/[\w:-]+)/g);
            if (parts.length > 1) {
              return parts.map((seg, k) => {
                const ma = /^(\s?)(@[\w./:-]+)$/.exec(seg);
                if (ma) return <React.Fragment key={k}>{ma[1]}<span className="at-mention">{mentionLabel(ma[2])}</span></React.Fragment>;
                const ms = /^(\s?)(\/[\w:-]+)$/.exec(seg);
                if (ms && isValidSkill(ms[2], p.commands))
                  return <React.Fragment key={k}>{ms[1]}<span className="slash-cmd-inline">{ms[2]}</span></React.Fragment>;
                return <React.Fragment key={k}>{seg}</React.Fragment>;
              });
            }
            return text;
          })()}
        </div>
        <InputGroupTextarea
          ref={taRef}
          value={text}
          onChange={(e) => {
            // Le redimensionnement contrôlé se produit après ce changement.
            // Mémoriser si la frappe était à la fin évite que WebKit remonte le
            // scroll interne et fasse disparaître le curseur sur un long prompt.
            e.currentTarget.dataset.composerFollowCaret =
              e.currentTarget.selectionEnd === e.currentTarget.value.length ? "end" : "preserve";
            setText(e.currentTarget.value);
          }}
          onScroll={(e) => {
            const bd = e.currentTarget.parentElement?.querySelector(".ta-backdrop");
            if (bd) bd.scrollTop = e.currentTarget.scrollTop;
          }}
          onPaste={(e) => {
            for (const item of e.clipboardData.items) {
              if (item.type.startsWith("image/")) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) continue;
                const reader = new FileReader();
                reader.onload = () => p.onPasteImage(String(reader.result));
                reader.readAsDataURL(file);
                return;
              }
            }
            // long collage de texte → chip compact au lieu de gonfler le champ
            const pasted = e.clipboardData.getData("text/plain");
            if (pasted.length >= 1000 || pasted.split("\n").length >= 10) {
              e.preventDefault();
              p.onPasteText(pasted);
            }
          }}
          onKeyDown={(e) => {
            if (suggestions.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelIdx((i) => (i + 1) % suggestions.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
                return;
              }
              if (e.key === "Tab" || e.key === "Enter") {
                e.preventDefault();
                applySuggestion(suggestions[Math.min(selIdx, suggestions.length - 1)]);
                return;
              }
              if (e.key === "Escape") {
                setText((t) => t + " ");
                return;
              }
            }
            if (e.key === "Escape" && p.workingSince != null) {
              e.preventDefault();
              p.onStop();
              return;
            }
            if (e.key === "Enter" && e.altKey) {
              e.preventDefault();
              window.dispatchEvent(new CustomEvent("quick-ask-open", { detail: { draft: text } }));
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              // composition IME en cours (kanji/hangul…) : cet Enter valide le
              // candidat, il ne doit JAMAIS envoyer le message (fix plan 015)
              if (e.nativeEvent.isComposing) return;
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement).requestSubmit();
            }
          }}
          disabled={p.disabled}
          rows={1}
          placeholder={t("chat.placeholder")}
        />
        </div>
    </>
  );
}
