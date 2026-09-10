import { act, cleanup, render } from "@testing-library/react";
import { StrictMode, useLayoutEffect, useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AssistantRuntimeProvider,
  MessageByIndexProvider,
  MessagePrimitive,
  type ThreadMessageLike,
  useExternalStoreRuntime,
} from "@assistant-ui/react";

afterEach(cleanup);

const messages: ThreadMessageLike[] = [
  { id: "hover-message", role: "assistant", content: [{ type: "text", text: "Réponse" }] },
];

function HoverMessage({ replacement }: { replacement: number }) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Ref callbacks run during commit, before passive effects. This is the same
  // ordering as a browser mouseenter delivered during a reload. The second
  // mount replaces the DOM node while the message client remains committed.
  useLayoutEffect(() => {
    rootRef.current?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  }, [replacement]);

  return (
    <MessagePrimitive.Root
      key={replacement}
      ref={rootRef}
      data-testid="hover-message"
    />
  );
}

function Harness({ replacement }: { replacement: number }) {
  const runtime = useExternalStoreRuntime({
    messages,
    convertMessage: (message: ThreadMessageLike) => message,
    onNew: async () => {},
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <MessageByIndexProvider index={0}>
        <HoverMessage replacement={replacement} />
      </MessageByIndexProvider>
    </AssistantRuntimeProvider>
  );
}

describe("assistant-ui message hover lifecycle", () => {
  it("gates pre-effect pointer events and survives a same-client ref replacement", async () => {
    expect(() => {
      const view = render(
        <StrictMode>
          <Harness replacement={0} />
        </StrictMode>,
      );

      act(() => {
        view.rerender(
          <StrictMode>
            <Harness replacement={1} />
          </StrictMode>,
        );
      });
    }).not.toThrow(/Resource updated before mount/);
  });
});
