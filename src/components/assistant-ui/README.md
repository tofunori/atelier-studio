# assistant-ui elements

These transcript, composer, attachment, image, markdown, reasoning, queue,
permission, reasoning-effort, and tool components are generated from the
official assistant-ui registry (`thread`, `model-selector`, `message-queue`,
`permission-grant`, and `reasoning-effort`) and upstream package sources. They
retain the assistant-ui MIT license and upstream component names; the registry
sources are available at
<https://r.assistant-ui.com/thread.json>,
<https://r.assistant-ui.com/model-selector.json>,
<https://r.assistant-ui.com/message-queue.json>,
<https://r.assistant-ui.com/permission-grant.json>,
<https://r.assistant-ui.com/elements-reasoning-effort.json>.

Upstream attribution: Copyright (c) 2025 AgentbaseAI Inc., MIT License. The
full upstream license text is kept in [`LICENSE`](./LICENSE) beside these
files. This integration was audited on 2026-09-10 against snapshot commit
`1a5da0f272668cf313e5213e49aa70e0f987de6d` and the published registry URLs
listed above; the temporary audit checkout is not required to reproduce the
license or source attribution.

The local integration only adapts the import aliases to Atelier's
`tw:`-prefixed Base UI primitives and adds the `Thread` slots documented in
`thread.aui.tsx` (`composerControls`, `messageActions`, `userMessageActions`,
and `queue`). In the production host and `AssistantUiHostBench`,
`AssistantUiComposerSuggestions` mounts the official command/mention menu
items; `PromptLibrary` is mounted from the Consignes popover when the host
provides its catalog; and the official dictation controls are mounted only
when the Tauri/macOS adapter reports support. The
additional official leaves (`AgentPlan`, `AgentStatus`, `TodoList`,
`ReasoningPanel`, `ErrorState`, `ToolError`, `ApprovalCard`,
`ElicitationForm`, `PromptLibrary`, `ComposerContext`, `ContextDisplay`,
`CodeDiff`, `ReviewableDiff`, `MessageAttachments`, `MessageBranches`,
`ThreadList`, `ThreadSearch`, `QuoteBlock`, `SelectionToolbar`, `QuoteReply`,
and the composer menu/mention/command exports in `composer-elements.tsx`) keep
their upstream props and callbacks so the projection or host can opt into them
without another renderer.

The thread's quiet reading rail, hover/focus action bars, flat rounded-2xl
composer, and compact tool/reasoning disclosure follow the official Claude
Clone example from assistant-ui:
<https://github.com/assistant-ui/assistant-ui/blob/main/apps/docs/components/pages/examples/claude.tsx>.
Only that example's structural treatment is reused here; Atelier's font,
palette, callbacks, message parts, attachments, and provider controls remain
the source of truth. The thread keeps a `requires-action` tool group open so
the official approval/elicitation card is immediately reachable; completed
tool groups keep the compact closed default.
`AssistantUiComposerSuggestions` composes those official menu primitives with
the Atelier command/file/Zotero/agent callbacks. It observes the assistant-ui
composer state through `useAuiState` and writes selections through the official
`aui.composer.setText` runtime method; it does not introduce a second input.
`AssistantUiKnowledgePicker` composes the official `ThreadSearch` and
`ComposerMenuItem` leaves with the shared Atelier KB action binding. Its
collection/admin control opens the existing native Connaissances surface, so
the composer does not fork a second knowledge-library implementation.
The rendering and interaction behavior remains provided by assistant-ui. The
local audit record is [the element coverage table](../../../docs/assistant-ui-elements-coverage.md).
Provider-specific leaves stay unmounted until their runtime payload and
callback contract exist; `ActivityGraph`, for example, also needs the optional
`heat-graph` dependency and is kept in `catalogue/` staging rather than copied
as a static mock.


ConversationMapAui is mounted directly under the official viewport. Its staged
upstream sources are unchanged in behavior; local adaptations are import paths,
`tw:` class prefixes, portal scope, ES-compatible last-element access, and measurement refresh when existing messages stream.
The chat reserves a gutter at pane widths >= 420 px and hides the map below it.
ReasoningEffort accepts missing usage/budget data to show an unavailable state
instead of a fabricated gauge. Its controls use the provider-advertised levels
and the same selection forwarded to the native send callback.
