# Installing Atelier

This is the one installation guide for Atelier. The README and the release
notes link here. To build and restart Atelier from source while developing it,
see [Build from source](#build-from-source) at the end.

## What you need

- A Mac with Apple Silicon (M1 or later) running macOS 12.3 or later. Intel
  Macs are not supported.
- At least one agent: **Claude Code** (with a Claude account) or **Codex**
  (with a ChatGPT account). Atelier installs and signs in to either one for
  you on first launch.
- Nothing else is required to open the app. It ships its own backend, so you
  do not need Node.js or Python. A few features use extra tools, listed in
  [Optional tools](#optional-tools).

## 1. Download and install

1. Download the `.dmg` file from the
   [latest release](https://github.com/tofunori/atelier-studio/releases/latest).
2. Open it and drag **Atelier** into **Applications**.
3. Eject the disk image.

## 2. Open it the first time

Atelier is not yet signed with an Apple Developer ID or notarized by Apple, so
macOS blocks the first launch. Allow it once for each version you download:

- **macOS 15 (Sequoia) or later:** open Atelier. When macOS says it cannot
  verify the app, click **Done**. Open **System Settings → Privacy &
  Security**, scroll to **Security**, click **Open Anyway** next to Atelier,
  and confirm.
- **macOS 14 or earlier:** in Finder, Control-click **Atelier** in
  Applications, choose **Open**, then click **Open** again.
- **If macOS says Atelier "is damaged and can't be opened":** the download
  still carries its quarantine flag. Run this in Terminal, then open Atelier
  normally:

  ```sh
  xattr -cr /Applications/Atelier.app
  ```

## 3. Connect an agent

If neither Claude Code nor Codex is ready, Atelier opens **Welcome to
Atelier**. Each agent row shows whether it is installed and signed in, with a
button for the next step:

| Agent | Install | Sign in |
| --- | --- | --- |
| Claude Code | `curl -fsSL https://claude.ai/install.sh \| bash` | `claude auth login` |
| Codex | `brew install --cask codex` (the button installs Homebrew first if it is missing) | `codex login` |

When a project is open, these commands run in Atelier's built-in terminal.
Otherwise the window shows the command with **Copy** and **Open Terminal**:
paste it into Terminal, press Return, then come back and click **Check
again**. **Finish** becomes available as soon as one agent is **Ready**.

**Later** closes the window. You can reopen it from **Settings → Environment →
Welcome window**, or with **Finish setup** on the home screen.

Agents installed before you opened Atelier are found automatically. If you
install one while Atelier is open, click **Check again** in **Settings →
Environment** (or in **Settings → Models**, under **Unavailable**). Claude
sessions need a recent Claude Code (2.1.139 or newer); the official installer
above always gets the current version.

Atelier also works with the Grok, Kimi and OpenCode command-line agents if you
install them yourself. They appear in **Settings → Models**.

## Optional tools

**Settings → Environment** lists what each feature needs on this Mac, shows
**Found** or **Missing**, and offers an install button. The welcome window
shows Zotero under **Optional**.

<!-- PDF and LaTeX tools: PDFium ships in the app and tectonic is downloaded on
     the first compile (since 2026-09-28). -->

| Tool | Used for | Install |
| --- | --- | --- |
| Homebrew | Installing Codex | The official command from [brew.sh](https://brew.sh) |
| Git (Xcode command line tools) | Restore points for every agent turn, and the Git panel | `xcode-select --install` |
| LaTeX | Compiling LaTeX documents | Nothing to install: MacTeX is used if present, otherwise the first **Compile** downloads tectonic |
| Zotero | Your library and its attachments | [zotero.org/download](https://www.zotero.org/download/) |

Reading PDFs needs nothing extra. Atelier ships its own PDF engine (PDFium)
for PDF import into the knowledge base, PDF reading mode and highlights.

Without MacTeX, the first LaTeX compile needs an internet connection. It
downloads a pinned version of tectonic (checksum verified) into Atelier's data
folder, and tectonic then fetches the TeX packages your document uses. Jumping
between LaTeX source and the compiled PDF (SyncTeX) works with either.

<!-- End of PDF and LaTeX tools. -->

Atelier finds Zotero's data folder by itself, including a folder you moved in
Zotero's own settings. If it does not, set it in **Settings → Integrations →
References → Zotero data folder**.

## Optional integrations

A Ragdoc server, gbrain, Compute (a Docker NAS and Slurm clusters over SSH)
and a Crossref contact email are off until you fill them in under **Settings →
Integrations** and click **Save**. Nothing contacts a remote host before that.

## Language

Atelier follows the language of macOS: French if macOS is in French, English
otherwise. Change it in **Settings → General**.

## Updating

Atelier does not update itself yet. Quit it, download the new `.dmg`, and
replace the app in Applications. macOS asks for approval again (step 2).
Your conversations and settings are kept.

## Where your data lives

- `~/Library/Application Support/atelier-studio/`: conversations, settings,
  integrations, PDF highlights and notes, and tectonic if Atelier downloaded
  it (`tools/`). Highlights are kept here rather than written into your PDF
  files.
- A `.fig_thumbs/` folder in each project: figure thumbnails, safe to delete.

To uninstall, quit Atelier and move it from Applications to the Trash. Delete
the folder above only if you also want to erase your conversations, settings
and PDF highlights.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| An agent is listed as unavailable after you installed it | **Check again** in Settings → Environment |
| **Sign-in required** next to an agent | Click **Sign in**, or run `claude auth login` or `codex login` in Terminal |
| A PDF import or reading-mode error saying the `atelier-pdf` tool or PDFium is missing | Reinstall Atelier: the PDF engine ships inside the app |
| The first LaTeX compile fails while downloading tectonic | Check the internet connection and compile again, or install MacTeX |
| The Zotero library is empty | Set the Zotero data folder in Settings → Integrations |

Report other problems in
[GitHub issues](https://github.com/tofunori/atelier-studio/issues).

## Build from source

For contributors. You need an Apple Silicon Mac with the Xcode command line
tools, a stable Rust toolchain ([rustup.rs](https://rustup.rs)) and Node.js
22.18 or later. The full test suite also uses Python 3, and
`scripts/fetch-pdfium.sh` to download the PDF engine (the app build runs it by
itself).
[`sccache`](https://github.com/mozilla/sccache) is optional and speeds up
rebuilds.

Dependencies are locked separately in several folders:

```sh
npm ci
for dir in gallery gallery/notes-src gallery/whiteboard-src packages/atelier-protocol; do
  npm --prefix "$dir" ci
done
```

Then build the app:

```sh
npm run tauri:build:app
```

The app lands in `src-tauri/target/release/bundle/macos/Atelier.app`, signed
ad hoc. Before building over a running copy, stop it and its servers exactly as
described in [PROTOCOLE_RELANCE.md](PROTOCOLE_RELANCE.md) (in French). That file
is the only build and restart procedure; the checks, the stop list and the
restart verification live there. `npm run tauri dev` gives a hot-reloading
development build when run from your own terminal.

More developer references: [TypeScript sources](agent-reference/typescript-sources.md)
and the commands in `package.json` (`npm run verify` runs the repository
checks).
