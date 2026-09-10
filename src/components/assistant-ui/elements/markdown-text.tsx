"use client";

import "@assistant-ui/react-markdown/styles/dot.css";

import {
  type CodeHeaderProps,
  MarkdownTextPrimitive,
  type SyntaxHighlighterProps,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
  useIsMarkdownCodeBlock,
} from "@assistant-ui/react-markdown";
import { type FC, memo, useMemo, useRef } from "react";
import type { TextMessagePartProps } from "@assistant-ui/react";
import { CheckIcon, CopyIcon } from "lucide-react";

import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";
// Pipeline markdown du chat (src/components/chat/md.tsx) : KaTeX/remark-math,
// blocs de code hljs (copie incluse), images locales, liens fichier:ligne /
// passages Zotero-gbrain. `useMdPlugins` bascule sur les plugins math une fois
// chargés à l'idle (cf. md.tsx `loadMath` — importer ce module suffit à
// démarrer ce chargement, une seule fois pour toute l'app). On réutilise ces
// composants tels quels plutôt que de dupliquer le rendu markdown pour le
// chat assistant-ui (plan 065 phase A).
import { MD_COMPONENTS, PreBlock as MdPreBlock, useMdPlugins } from "@/components/chat/md";

type MarkdownTextProps = Partial<TextMessagePartProps> & {
  components?: Parameters<typeof memoizeMarkdownComponents>[0];
};

const useShallowStable = <T extends Record<string, unknown> | undefined>(
  value: T,
): T => {
  const ref = useRef(value);
  if (value !== ref.current) {
    const prev = ref.current;
    const stable =
      value !== undefined &&
      prev !== undefined &&
      Object.keys(prev).length === Object.keys(value).length &&
      Object.keys(value).every((key) => prev[key] === value[key]);
    if (!stable) ref.current = value;
  }
  return ref.current;
};

const MarkdownTextImpl: FC<MarkdownTextProps> = ({ components }) => {
  const stableComponents = useShallowStable(components);
  const { remark: remarkPlugins, rehype: rehypePlugins } = useMdPlugins();
  const markdownComponents = useMemo(() => {
    if (!stableComponents) return baseComponents;
    return {
      ...baseComponents,
      ...memoizeMarkdownComponents(stableComponents),
    };
  }, [stableComponents]);

  return (
    <MarkdownTextPrimitive
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      className="aui-md"
      components={markdownComponents}
      defer
    />
  );
};

export const MarkdownText = memo(MarkdownTextImpl);

const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const onCopy = () => {
    if (!code || isCopied) return;
    copyToClipboard(code);
  };

  return (
    <div className="aui-code-header-root tw:border-border/50 tw:bg-muted/50 tw:mt-3 tw:flex tw:items-center tw:justify-between tw:rounded-t-xl tw:border tw:border-b-0 tw:px-3.5 tw:py-1.5 tw:text-xs">
      <span className="aui-code-header-language tw:text-muted-foreground tw:font-medium tw:lowercase">
        {language}
      </span>
      <TooltipIconButton tooltip="Copy" onClick={onCopy}>
        {!isCopied && (
          <CopyIcon className="tw:animate-in tw:zoom-in-75 tw:fade-in tw:duration-150" />
        )}
        {isCopied && (
          <CheckIcon className="tw:animate-in tw:zoom-in-50 tw:fade-in tw:duration-200 tw:ease-out" />
        )}
      </TooltipIconButton>
    </div>
  );
};

const defaultComponents = memoizeMarkdownComponents({
  h1: ({ className, ...props }) => (
    <h1
      className={cn(
        "aui-md-h1 tw:mt-5 tw:mb-2 tw:scroll-m-20 tw:text-xl tw:font-semibold tw:first:mt-0 tw:last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn(
        "aui-md-h2 tw:mt-5 tw:mb-2 tw:scroll-m-20 tw:text-lg tw:font-semibold tw:first:mt-0 tw:last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      className={cn(
        "aui-md-h3 tw:mt-4 tw:mb-1.5 tw:scroll-m-20 tw:text-base tw:font-semibold tw:first:mt-0 tw:last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h4: ({ className, ...props }) => (
    <h4
      className={cn(
        "aui-md-h4 tw:mt-3.5 tw:mb-1 tw:scroll-m-20 tw:text-base tw:font-medium tw:first:mt-0 tw:last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h5: ({ className, ...props }) => (
    <h5
      className={cn(
        "aui-md-h5 tw:mt-3 tw:mb-1 tw:text-sm tw:font-semibold tw:first:mt-0 tw:last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h6: ({ className, ...props }) => (
    <h6
      className={cn(
        "aui-md-h6 tw:mt-3 tw:mb-1 tw:text-sm tw:font-medium tw:first:mt-0 tw:last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  p: ({ className, ...props }) => (
    <p
      className={cn(
        "aui-md-p tw:my-3 tw:leading-relaxed tw:first:mt-0 tw:last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn(
        "aui-md-a tw:text-primary tw:hover:text-primary/80 tw:underline tw:underline-offset-2",
        className,
      )}
      {...props}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn(
        "aui-md-blockquote tw:border-muted-foreground/30 tw:text-muted-foreground tw:my-3 tw:border-s-2 tw:ps-4",
        className,
      )}
      {...props}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn(
        "aui-md-ul tw:marker:text-muted-foreground tw:my-3 tw:ms-5 tw:list-disc tw:[&>li]:mt-1",
        className,
      )}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn(
        "aui-md-ol tw:marker:text-muted-foreground tw:my-3 tw:ms-5 tw:list-decimal tw:[&>li]:mt-1",
        className,
      )}
      {...props}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr
      className={cn("aui-md-hr tw:border-muted-foreground/20 tw:my-3", className)}
      {...props}
    />
  ),
  table: ({ className, ...props }) => (
    <div className="aui-md-table-wrapper tw:my-3 tw:overflow-x-auto">
      <table
        className={cn(
          "aui-md-table tw:w-full tw:border-separate tw:border-spacing-0",
          className,
        )}
        {...props}
      />
    </div>
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        "aui-md-th tw:bg-muted tw:px-3 tw:py-1.5 tw:text-start tw:font-medium tw:first:rounded-ss-lg tw:last:rounded-se-lg tw:[[align=center]]:text-center tw:[[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn(
        "aui-md-td tw:border-muted-foreground/20 tw:border-s tw:border-b tw:px-3 tw:py-1.5 tw:text-start tw:last:border-e tw:[[align=center]]:text-center tw:[[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  tr: ({ className, ...props }) => (
    <tr
      className={cn(
        "aui-md-tr tw:m-0 tw:border-b tw:p-0 tw:first:border-t tw:[&:last-child>td:first-child]:rounded-es-lg tw:[&:last-child>td:last-child]:rounded-ee-lg",
        className,
      )}
      {...props}
    />
  ),
  li: ({ className, ...props }) => (
    <li className={cn("aui-md-li tw:leading-relaxed", className)} {...props} />
  ),
  strong: ({ className, ...props }) => (
    <strong
      className={cn("aui-md-strong tw:font-semibold", className)}
      {...props}
    />
  ),
  sup: ({ className, ...props }) => (
    <sup
      className={cn("aui-md-sup tw:[&>a]:text-xs tw:[&>a]:no-underline", className)}
      {...props}
    />
  ),
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        "aui-md-pre tw:border-border/50 tw:bg-muted/30 tw:overflow-x-auto tw:rounded-t-none tw:rounded-b-xl tw:border tw:border-t-0 tw:p-3.5 tw:text-[13px] tw:leading-relaxed",
        className,
      )}
      {...props}
    />
  ),
  code: function Code({ className, ...props }) {
    const isCodeBlock = useIsMarkdownCodeBlock();
    return (
      <code
        className={cn(
          !isCodeBlock &&
            "aui-md-inline-code tw:bg-muted tw:rounded-md tw:px-1.5 tw:py-0.5 tw:font-mono tw:text-[0.85em]",
          className,
        )}
        {...props}
      />
    );
  },
  CodeHeader,
});

// MarkdownTextPrimitive ne passe JAMAIS le `pre` fourni tel quel pour une
// fence de code : PreOverride/CodeOverride le recomposent en
// SyntaxHighlighter(node, components:{Pre,Code}, language, code) — `pre`
// (donc PreBlock/md.tsx) n'y reçoit plus un enfant `<code className="language-…">`
// mais un élément déjà éclaté, ce qui casse la détection de langage de
// PreBlock. On rebranche PreBlock via ce point d'extension à la place :
// même détection Mermaid + coloration hljs + bouton copie que le chat,
// juste reconstitué dans la forme `{children:{props:{className,children}}}`
// que PreBlock attend. `MD_COMPONENTS.pre` reste utilisé tel quel pour le
// SEUL cas où `pre` n'entoure pas un `code` (fallback de PreOverride).
const MdSyntaxHighlighter: FC<SyntaxHighlighterProps> = ({ language, code }) => (
  <MdPreBlock
    children={{
      props: { className: language ? `language-${language}` : undefined, children: code },
    }}
  />
);

// Composants réels de md.tsx par-dessus le style assistant-ui : `pre`
// (fallback hors fence) + `SyntaxHighlighter` (fence de code, coloration hljs
// + Mermaid + bouton copie — remplace le `CodeHeader` d'assistant-ui, déjà
// équipé), `img` (images locales tauri://), `table` (wrapper .md-table),
// `p` (cartes passage Zotero/gbrain) et `a`/`code` (liens fichier:ligne,
// citations base de connaissances, passages). Les balises non couvertes par
// md.tsx (h1-h6, blockquote, ul/ol, hr, th/td/tr, li, strong, sup) gardent le
// style Tailwind par défaut d'assistant-ui.
const baseComponents = {
  ...defaultComponents,
  ...memoizeMarkdownComponents(MD_COMPONENTS),
  CodeHeader: () => null,
  SyntaxHighlighter: MdSyntaxHighlighter,
};
