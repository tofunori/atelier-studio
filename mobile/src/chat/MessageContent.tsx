import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button.tsx";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

type Props = {
  text: string;
  markdown?: boolean;
  collapsible?: boolean;
};

const LONG_MESSAGE_CHARS = 650;
const LONG_MESSAGE_LINES = 12;

export function isLongMessage(text: string): boolean {
  return text.length > LONG_MESSAGE_CHARS || text.split("\n").length > LONG_MESSAGE_LINES;
}

export function MessageContent({ text, markdown = true, collapsible = true }: Props) {
  const canCollapse = collapsible && isLongMessage(text);
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className={`message-content ${canCollapse && !expanded ? "is-collapsed" : ""}`}>
        {markdown ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        ) : (
          text
        )}
      </div>
      {canCollapse && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronUpIcon data-icon="inline-start" /> : <ChevronDownIcon data-icon="inline-start" />}
          {expanded ? "Réduire" : "Afficher la suite"}
        </Button>
      )}
    </>
  );
}
