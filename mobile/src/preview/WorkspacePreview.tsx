import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, BookOpen, ChevronRight, FileText, MessageSquare, Moon, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import { Message, MessageContent } from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Attachment, AttachmentContent } from "@/components/ui/attachment";
import { MessageScrollerProvider, MessageScroller, MessageScrollerViewport, MessageScrollerContent } from "@/components/ui/message-scroller";
import { PdfViewer } from "../files/viewers/PdfViewer";

const INITIAL_SOURCE = String.raw`\documentclass{article}
\title{Notes de travail}
\begin{document}
\maketitle

\section{Une question, un document}
Un espace de travail rassemble une conversation,
un document et les observations qui les accompagnent.
Passer de l'un a l'autre ne devrait pas interrompre
le fil de la reflexion.

\section{Relecture}
Cette page sert uniquement a essayer la navigation.
Selectionnez un passage pour le joindre au chat.
Aucun resultat scientifique n'est presente ici.

\end{document}`;
type Surface = "chat" | "document";

export default function WorkspacePreview() {
  const [home, setHome] = useState(true);
  const [surface, setSurface] = useState<Surface>("chat");
  const [mode, setMode] = useState("pdf");
  const [light, setLight] = useState(false);
  const [draft, setDraft] = useState("");
  const [source, setSource] = useState(INITIAL_SOURCE);
  const [selection, setSelection] = useState("");
  const [attachment, setAttachment] = useState("");
  const [messages, setMessages] = useState<{ text: string; excerpt: string }[]>([]);
  const [notice, setNotice] = useState("");
  const [pdf, setPdf] = useState<Uint8Array | null>(null);
  const [pdfError, setPdfError] = useState(false);
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 800px)").matches);
  const editor = useRef<HTMLTextAreaElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 800px)");
    const update = () => setWide(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(new URL("preview/notes.pdf", document.baseURI), { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error("PDF unavailable"); return r.arrayBuffer(); })
      .then((data) => setPdf(new Uint8Array(data)))
      .catch(() => { if (!controller.signal.aborted) setPdfError(true); });
    return () => controller.abort();
  }, []);

  function open(next: Surface) { setSurface(next); setHome(false); }
  function discuss() {
    if (!selection.trim()) return;
    setAttachment(selection);
    setSurface("chat");
    requestAnimationFrame(() => composer.current?.focus());
  }
  function send() {
    if (!draft.trim()) return;
    setMessages((previous) => [...previous, { text: draft.trim(), excerpt: attachment }]);
    setDraft(""); setAttachment("");
    setNotice("Message ajouté à la démonstration. Aucun agent n’a été appelé.");
  }

  return (
    <div className="workspace-preview" data-theme={light ? "light" : "dark"}>
      <header className="preview-header" hidden={!home}>
        <div className="preview-brand"><span className="preview-mark" aria-hidden="true">a</span><span>atelier<span className="preview-brand-dot">.</span></span></div>
        <div className="preview-header-actions"><Badge variant="outline">Aperçu interactif</Badge><Button variant="ghost" size="icon" aria-label={light ? "Mode sombre" : "Mode clair"} onClick={() => setLight(!light)}>{light ? <Moon /> : <Sun />}</Button></div>
      </header>
      <div className="preview-home" hidden={!home}>
        <div className="preview-home-intro"><p className="preview-eyebrow">VOTRE ESPACE DE TRAVAIL</p><h1>Reprendre le fil.</h1><p>Vos idées, vos documents.<br />Au même endroit.</p></div>
        <section aria-labelledby="resume-title">
          <div className="preview-section-heading"><h2 id="resume-title">Dernier espace ouvert</h2><span>Projet de démonstration</span></div>
          <button className="preview-resume" onClick={() => open("chat")}>
            <div className="preview-resume-icon"><BookOpen aria-hidden="true" /></div>
            <span><strong>Carnet de recherche</strong><span>Relecture et notes de travail</span><small>1 conversation · 1 document</small></span><ChevronRight aria-hidden="true" />
          </button>
        </section>
        <section className="preview-recent" aria-labelledby="recent-title"><div className="preview-section-heading"><h2 id="recent-title">À portée de main</h2></div>
          <button className="preview-recent-row" onClick={() => open("document")}><FileText aria-hidden="true" /><span><strong>notes.tex</strong><small>Source LaTeX et aperçu PDF</small></span><ChevronRight aria-hidden="true" /></button>
          <button className="preview-recent-row" onClick={() => open("chat")}><MessageSquare aria-hidden="true" /><span><strong>Relire un passage</strong><small>Reprendre la conversation</small></span><ChevronRight aria-hidden="true" /></button>
        </section>
        <p className="preview-local-note">Un aperçu local pour essayer l’interface.<br />Vos projets et vos fichiers ne sont pas modifiés.</p>
      </div>
      <main className="preview-workspace" hidden={home}>
        <div className="preview-project-heading"><Button variant="ghost" size="icon" aria-label="Retour à l’accueil" onClick={() => setHome(true)}><ArrowLeft /></Button><div><h1>Carnet de recherche</h1><p>Relecture et notes de travail</p></div><Button variant="ghost" size="icon" aria-label={light ? "Mode sombre" : "Mode clair"} onClick={() => setLight(!light)}>{light ? <Moon /> : <Sun />}</Button></div>
        <Tabs value={surface} onValueChange={(value) => setSurface(value as Surface)} className="preview-surface-tabs">
          <TabsList aria-label="Espace de travail"><TabsTrigger value="chat" id="preview-chat-tab" aria-controls="preview-chat"><MessageSquare />Chat</TabsTrigger><TabsTrigger value="document" id="preview-document-tab" aria-controls="preview-document"><FileText />Document</TabsTrigger></TabsList>
        </Tabs>
        <div className="preview-panels" data-surface={surface}>
          <section id="preview-chat" className="preview-chat" role={wide ? "region" : "tabpanel"} aria-label={wide ? "Conversation" : undefined} aria-labelledby={wide ? undefined : "preview-chat-tab"} tabIndex={0} data-selected={surface === "chat"}>
            <div className="preview-pane-heading"><span>CONVERSATION</span><span>Relecture</span></div>
            <MessageScrollerProvider><MessageScroller><MessageScrollerViewport><MessageScrollerContent className="preview-transcript">
              <p className="preview-transcript-date">Exemple de conversation</p>
              <Message align="end"><MessageContent><Bubble variant="secondary"><BubbleContent>J’aimerais relire ce passage en gardant le document à côté.</BubbleContent></Bubble></MessageContent></Message>
              <Message><MessageContent><span className="preview-assistant-label">ATELIER</span><Bubble variant="ghost"><BubbleContent><p>Ouvrez les notes, puis sélectionnez un passage dans la source pour le joindre à cette conversation.</p><p>Votre brouillon reste ici pendant la lecture.</p></BubbleContent></Bubble><Attachment><AttachmentContent><Button variant="ghost" onClick={() => open("document")}><FileText data-icon="inline-start" />notes.tex<ChevronRight data-icon="inline-end" /></Button></AttachmentContent></Attachment></MessageContent></Message>
              {messages.map((message, i) => <Message key={i} align="end"><MessageContent>{message.excerpt && <blockquote className="preview-quote">{message.excerpt}</blockquote>}<Bubble variant="secondary"><BubbleContent>{message.text}</BubbleContent></Bubble></MessageContent></Message>)}
            </MessageScrollerContent></MessageScrollerViewport></MessageScroller></MessageScrollerProvider>
            <form className="preview-composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
              {attachment && <div className="preview-selection"><span><strong>notes.tex · sélection</strong><q>{attachment}</q></span><Button variant="ghost" size="icon" aria-label="Retirer le passage" onClick={() => setAttachment("")}><X /></Button></div>}
              <InputGroup><InputGroupTextarea ref={composer} aria-label="Message" placeholder="Poursuivre la réflexion…" value={draft} onChange={(event) => setDraft(event.target.value)} /><InputGroupAddon align="block-end"><span className="preview-composer-hint">Brouillon conservé entre les vues</span><Button type="submit" size="icon" aria-label="Ajouter le message à la démonstration" disabled={!draft.trim()}><ArrowUp /></Button></InputGroupAddon></InputGroup>
              <p className="preview-feedback" role="status">{notice || "Démonstration locale · aucun envoi au Mac"}</p>
            </form>
          </section>
          <section id="preview-document" className="preview-document" role={wide ? "region" : "tabpanel"} aria-label={wide ? "Document" : undefined} aria-labelledby={wide ? undefined : "preview-document-tab"} tabIndex={0} data-selected={surface === "document"}>
            <div className="preview-document-heading"><span><strong>notes.tex</strong><small>{source === INITIAL_SOURCE ? "Document de démonstration" : "Modifications locales · PDF initial"}</small></span><ToggleGroup value={[mode]} onValueChange={(value) => { if (value[0]) setMode(value[0]); }} aria-label="Vue du document"><ToggleGroupItem value="source">Source</ToggleGroupItem><ToggleGroupItem value="pdf">PDF</ToggleGroupItem></ToggleGroup></div>
            <div className="preview-source" hidden={mode !== "source"}><FieldGroup><Field><FieldLabel htmlFor="preview-source">Source LaTeX · édition temporaire</FieldLabel><Textarea id="preview-source" ref={editor} spellCheck={false} value={source} onChange={(event) => { setSource(event.target.value); setSelection(""); }} onSelect={(event) => { const node = event.currentTarget; setSelection(node.value.slice(node.selectionStart, node.selectionEnd)); }} /></Field></FieldGroup></div>
            <div className="preview-pdf" hidden={mode !== "pdf"}>{pdf ? <PdfViewer data={pdf} name="notes.pdf" /> : <p role="status">{pdfError ? "Le PDF de démonstration est indisponible." : "Ouverture du PDF…"}</p>}</div>
            <div className="preview-document-footer">{mode === "source" ? <Button variant="secondary" disabled={!selection.trim()} onClick={discuss}><MessageSquare data-icon="inline-start" />Discuter du passage</Button> : <Button variant="secondary" onClick={() => setMode("source")}><FileText data-icon="inline-start" />Ouvrir la source</Button>}<small>PDF d’exemple fixe · compilation non connectée</small></div>
          </section>
        </div>
      </main>
      <footer className="preview-bottom-note">Aperçu · contenu temporaire, réinitialisé au rechargement</footer>
    </div>
  );
}
