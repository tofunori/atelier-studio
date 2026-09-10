// Le chat assistant-ui doit rendre le markdown avec les MÊMES capacités que
// le chat historique (src/components/chat/md.tsx) : KaTeX (chargé à l'idle,
// cf. mathIdle.test.tsx) et coloration hljs des blocs de code. Ce test
// vérifie que MarkdownText (branché sur MD_COMPONENTS + useMdPlugins, plan
// « assistant-ui markdown ») produit bien un noeud `.katex` pour une formule
// et des classes `hljs`/`language-python` pour une fence Python — pas un
// simple `<span>`/`<code>` brut de react-markdown + remark-gfm.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import {
  AssistantRuntimeProvider,
  TextMessagePartProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import { MarkdownText } from "./markdown-text";

afterEach(cleanup);

// MarkdownTextPrimitive lit le texte via useMessagePartText() : il faut à la
// fois le contexte de partie de message (TextMessagePartProvider) et un
// runtime englobant (AssistantRuntimeProvider) — même montage minimal que
// src/lib/chat/assistantUiHover.test.tsx, sans monter tout le Thread.
function Harness({ text }: { text: string }) {
  const messages: ThreadMessageLike[] = [
    { id: "m1", role: "assistant", content: [{ type: "text", text }] },
  ];
  const runtime = useExternalStoreRuntime({
    messages,
    convertMessage: (message: ThreadMessageLike) => message,
    onNew: async () => {},
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <TextMessagePartProvider text={text}>
        <MarkdownText />
      </TextMessagePartProvider>
    </AssistantRuntimeProvider>
  );
}

describe("MarkdownText (chat assistant-ui) réutilise le pipeline markdown du chat", () => {
  it("rend une formule $...$ en KaTeX une fois les plugins maths chargés", async () => {
    const { container } = render(<Harness text="La formule $E=mc^2$ est célèbre." />);
    expect(container.textContent).toContain("La formule");
    await waitFor(
      () => expect(container.querySelector(".katex")).not.toBeNull(),
      { timeout: 4000 },
    );
  });

  it("colore une fence ```python via highlight.js (comme le chat historique)", async () => {
    const text = "```python\nprint('hi')\n```";
    const { container } = render(<Harness text={text} />);
    await waitFor(() => {
      const code = container.querySelector("code.hljs.language-python");
      expect(code).not.toBeNull();
    });
    const code = container.querySelector("code.hljs.language-python")!;
    // hljs a effectivement balisé le token, pas juste un <code> brut
    expect(code.innerHTML).toContain("hljs-");
    // le chrome du bloc (barre + bouton copie) vient de md.tsx, pas du
    // CodeHeader par défaut d'assistant-ui
    expect(container.querySelector(".codeblock-bar")).not.toBeNull();
    expect(container.querySelector(".codeblock-copy")).not.toBeNull();
  });
});
