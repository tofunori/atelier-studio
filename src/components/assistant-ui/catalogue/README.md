# assistant-ui element catalogue (staged upstream sources)

This directory contains the official assistant-ui element sources that are not
mounted by Atelier's production host yet. Files use the `.source` suffix on
purpose: Vite and TypeScript do not load them accidentally, and no element can
appear as a fake control merely because its source is present. The production
components that are already adapted live in `../elements/`.

The files are copied byte-for-byte from the assistant-ui snapshot pinned at
`1a5da0f272668cf313e5213e49aa70e0f987de6d` under
`packages/ui/src/components/react/assistant-ui/elements`. The [manifest](./manifest.json)
records every staged file and its external imports so each element can be
promoted only after its real Atelier data and callback contract is available.

The staged catalogue includes provider-optional surfaces (MCP, generative UI,
voice, charts and syntax highlighters). Those sources remain referenceable in
the Elements gallery, but are not rendered in the production transcript until
the corresponding package and provider capability are installed. This keeps
the catalogue complete without inventing a working action.
