import { useEffect, useMemo, useRef, useState } from "react";
import { languageForFile, tokenizeLine } from "./syntaxHighlight.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ButtonGroup } from "@/components/ui/button-group.tsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.tsx";
import { Toggle } from "@/components/ui/toggle.tsx";
import { CopyIcon, MessageSquarePlusIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";

type Props = {
  text: string;
  name: string;
  showLineNumbers?: boolean;
  onAddSelection?: (selection: { text: string; lineStart: number; lineEnd: number }) => void;
};

export function TextViewer(p: Props) {
  const [q, setQ] = useState("");
  const [showLines, setShowLines] = useState(p.showLineNumbers ?? true);
  const [selection, setSelection] = useState<{ text: string; lineStart: number; lineEnd: number } | null>(null);
  const bodyRef = useRef<HTMLPreElement>(null);
  const language = useMemo(() => languageForFile(p.name), [p.name]);

  const lines = useMemo(() => p.text.replace(/\r\n/g, "\n").split("\n"), [p.text]);
  const matchCount = useMemo(() => {
    if (!q) return 0;
    const lower = q.toLowerCase();
    return lines.filter((l) => l.toLowerCase().includes(lower)).length;
  }, [lines, q]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(p.text);
      toast.success("Fichier copié");
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const onSelectionChange = () => {
      const selected = window.getSelection();
      const body = bodyRef.current;
      if (!selected || selected.isCollapsed || !body || !selected.anchorNode || !selected.focusNode) {
        setSelection(null);
        return;
      }
      const anchorElement = selected.anchorNode.nodeType === Node.ELEMENT_NODE
        ? selected.anchorNode as Element
        : selected.anchorNode.parentElement;
      const focusElement = selected.focusNode.nodeType === Node.ELEMENT_NODE
        ? selected.focusNode as Element
        : selected.focusNode.parentElement;
      const anchorLine = anchorElement?.closest<HTMLElement>("[data-line]");
      const focusLine = focusElement?.closest<HTMLElement>("[data-line]");
      if (!anchorLine || !focusLine || !body.contains(anchorLine) || !body.contains(focusLine)) {
        setSelection(null);
        return;
      }
      const start = Number(anchorLine.dataset.line);
      const end = Number(focusLine.dataset.line);
      const text = selected.toString().trim();
      setSelection(text ? { text, lineStart: Math.min(start, end), lineEnd: Math.max(start, end) } : null);
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  return (
    <div className="viewer-text">
      <div className="viewer-toolbar">
        <InputGroup>
          <InputGroupAddon><SearchIcon /></InputGroupAddon>
          <InputGroupInput placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher dans le fichier" />
        </InputGroup>
        <ButtonGroup aria-label="Options du fichier texte">
          <Toggle variant="outline" pressed={showLines} onPressedChange={setShowLines} aria-label="Afficher les numéros de ligne">N°</Toggle>
          <Button type="button" variant="outline" size="sm" onClick={() => void copy()}><CopyIcon data-icon="inline-start" />Copier</Button>
        {p.onAddSelection && (
          <Button
            type="button"
            size="sm"
            disabled={!selection}
            onClick={() => selection && p.onAddSelection?.(selection)}
          >
            <MessageSquarePlusIcon data-icon="inline-start" />
            Ajouter la sélection
          </Button>
        )}
        </ButtonGroup>
        {q && <Badge variant="secondary">{matchCount} lignes</Badge>}
      </div>
      <div className="viewer-code-head">
        <span>{language === "plain" ? "Texte" : language}</span>
        <span>{lines.length} lignes</span>
      </div>
      <pre ref={bodyRef} className="viewer-text-body" data-language={language}>
        {lines.map((line, i) => {
          const hit = q && line.toLowerCase().includes(q.toLowerCase());
          return (
            <div key={i} data-line={i + 1} className={hit ? "line-hit" : undefined}>
              {showLines && <span className="line-no">{i + 1}</span>}
              <code className="line-txt">
                {tokenizeLine(line, language).map((token, tokenIndex) => (
                  <span key={tokenIndex} className={`syntax-${token.kind}`}>
                    {token.text}
                  </span>
                ))}
              </code>
            </div>
          );
        })}
      </pre>
    </div>
  );
}
