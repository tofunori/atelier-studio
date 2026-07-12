import { SiteHeader } from "./components/SiteHeader";
import { SurfaceExplorer } from "./components/SurfaceExplorer";

const GITHUB = "https://github.com/tofunori/atelier-studio";
const RELEASES = `${GITHUB}/releases/latest`;
const PRODUCT = { version: "1.3.0", versionLabel: "v1.3" } as const;

const featureGroups = [
  {
    number: "01",
    title: "Multi-agent conversations",
    summary: "Use the right agent without moving the work.",
    items: ["Claude Code and Codex native sessions", "Grok, OpenCode and Gemini backends", "Custom OpenAI-compatible API providers", "Provider handoff with visible conversation context", "Model, effort and permission controls"],
  },
  {
    number: "02",
    title: "Rich agent output",
    summary: "Readable while the work is still happening.",
    items: ["Streaming responses and grouped tool runs", "Syntax-highlighted code and inline diffs", "Markdown, tables, math and Mermaid", "Context-window and usage indicators", "Optional independent auto-review"],
  },
  {
    number: "03",
    title: "Scientific gallery",
    summary: "A living index of the project’s visual output.",
    items: ["Search, sort, folders and format filters", "Favorites, boards and S/M/L density", "Instant rescans and live project updates", "Non-destructive figure annotations", "Direct context return to chat"],
  },
  {
    number: "04",
    title: "Editors and viewers",
    summary: "Inspect the source beside the result.",
    items: ["PDF, SVG and raster image viewers", "LaTeX studio with fast suggestions", "Markdown reader and editor", "Code editor and file explorer", "Tabbed working files inside the atelier"],
  },
  {
    number: "05",
    title: "Native browser",
    summary: "Web research becomes usable context.",
    items: ["Native webview tabs and bookmarks", "History and restored browser sessions", "Local-server discovery", "Selection capture for chat", "Vivaldi bookmark and search import"],
  },
  {
    number: "06",
    title: "Terminal",
    summary: "The shell remains part of the workspace.",
    items: ["Integrated PTY sessions", "Tabs and split terminal layouts", "WebGL rendering and ANSI themes", "Project-aware working directories", "Web links and responsive fitting"],
  },
  {
    number: "07",
    title: "Git + run ledger",
    summary: "See exactly what changed and why.",
    items: ["Branch, ahead/behind and file status", "Unified or split diff review", "Stage, commit, pull and push", "Generated commit-message assistance", "Per-run files, tools, cost and snapshots"],
  },
  {
    number: "08",
    title: "Reference library",
    summary: "Zotero is a first-class work surface.",
    items: ["Collections, search and PDF-only filters", "Favorites and multiple sort modes", "Attached PDF reader", "Add local PDFs to Zotero", "Citekey, BibTeX and chat insertion"],
  },
  {
    number: "09",
    title: "Image generator",
    summary: "Create and revise visual assets in-project.",
    items: ["GPT Image 2 and Seedream 5.0 Pro", "1K and 2K output", "Prompt-based image editing", "Results saved inside the project", "Automatic gallery refresh"],
  },
  {
    number: "10",
    title: "Quick Ask + highlights",
    summary: "Small questions do not have to derail the main thread.",
    items: ["Floating, resizable scratch conversation", "Recent Quick Ask history", "Promote useful answers into a full chat", "Highlight and underline durable passages", "Filter and export research notes"],
  },
];

const providers = ["Claude Code", "Codex", "Grok", "OpenCode", "Gemini", "Custom APIs"];

export default function Home() {
  return (
    <div className="site-shell">
      <SiteHeader github={GITHUB} releases={RELEASES} />

      <main id="top">
        <section className="hero section-grid">
          <div className="measure-rail" aria-hidden="true">
            {Array.from({ length: 17 }).map((_, index) => <span key={index} />)}
          </div>

          <div className="hero-copy">
            <div className="eyebrow"><span className="status-dot" /> Native research workspace · {PRODUCT.versionLabel}</div>
            <h1>Research, with every tool <em>in reach.</em></h1>
            <p className="hero-lede">Read. Code. Annotate. Steer agents.</p>
            <p className="hero-body">
              A native macOS workspace for papers, figures, terminals, references, and AI sessions — connected by project context.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#surfaces">Explore the workspace <span aria-hidden="true">↓</span></a>
              <a className="button button-secondary" href={GITHUB} target="_blank" rel="noreferrer">View on GitHub <span aria-hidden="true">↗</span></a>
            </div>
            <dl className="hero-facts" aria-label="Atelier Studio summary">
              <div><dt>Target</dt><dd>macOS · Apple Silicon</dd></div>
              <div><dt>Surfaces</dt><dd>Chat · Atelier · Browser · Terminal · Git · Library</dd></div>
              <div><dt>Architecture</dt><dd>Native shell · local-first tools</dd></div>
            </dl>
          </div>

          <div className="hero-visual">
            <div className="calibration calibration-top" aria-hidden="true"><span>AT—01</span><span>INTEGRATED RESEARCH SURFACE</span></div>
            <div className="product-frame">
              <img src="/atelier-hero.png" alt="Atelier Studio showing project navigation, agent chat, and a live scientific gallery" />
              <span className="live-tag"><i /> Live workspace</span>
            </div>
            <div className="calibration calibration-bottom" aria-hidden="true"><span>1600 × 1000</span><span>LOCAL CONTEXT / NATIVE CONTROL</span></div>
          </div>
        </section>

        <section className="signal-band" aria-label="Core product principles">
          <span>One native window</span>
          <span>Project-aware context</span>
          <span>Your local agent sessions</span>
          <span>Figures stay actionable</span>
        </section>

        <section className="workflow section-grid" id="workflow">
          <div className="section-heading">
            <span className="section-index">01 / Workflow</span>
            <h2>The work stays connected.</h2>
            <p>Atelier is built around a simple loop: ask, inspect, return evidence, continue.</p>
          </div>

          <div className="workflow-track">
            <article>
              <span className="step-number">01</span>
              <div className="step-signal cobalt" />
              <h3>Ask in context</h3>
              <p>Start from a project. Claude, Codex, or another provider receives the right working directory, history, files, and permissions.</p>
            </article>
            <article>
              <span className="step-number">02</span>
              <div className="step-signal orange" />
              <h3>Inspect the output</h3>
              <p>Open the figure, paper, diff, terminal, browser result, or generated asset beside the active conversation.</p>
            </article>
            <article>
              <span className="step-number">03</span>
              <div className="step-signal acid" />
              <h3>Return the evidence</h3>
              <p>Annotate, select, cite, or highlight what matters and send that precise context straight back into the thread.</p>
            </article>
          </div>

          <div className="workflow-visual">
            <img src="/agent-flow.gif" alt="Animated Atelier Studio workflow moving between agent chat and project material" />
            <div className="workflow-caption"><span>LIVE LOOP</span><span>CHAT → INSPECT → ANNOTATE → CONTINUE</span></div>
          </div>
        </section>

        <section className="surfaces section-grid" id="surfaces">
          <div className="section-heading wide-heading">
            <span className="section-index">02 / Core surfaces</span>
            <h2>Your project is the interface.</h2>
            <p>Switch tasks without rebuilding context or scattering the research across separate apps.</p>
          </div>

          <SurfaceExplorer />
        </section>

        <section className="providers section-grid" aria-labelledby="providers-title">
          <div>
            <span className="section-index">Provider layer</span>
            <h2 id="providers-title">Choose the agent. Keep the workspace.</h2>
          </div>
          <div className="provider-grid">
            {providers.map((provider, index) => (
              <div className="provider-cell" key={provider}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{provider}</strong>
              </div>
            ))}
          </div>
          <p className="provider-note">
            Native CLI sessions reuse your existing sign-ins and permissions. API providers remain chat-focused and keep local replayable history.
          </p>
        </section>

        <section className="features section-grid" id="features">
          <div className="section-heading wide-heading">
            <span className="section-index">03 / Complete feature set</span>
            <h2>Every function, mapped.</h2>
            <p>A complete view of what Atelier brings into the research workspace today.</p>
          </div>

          <div className="feature-grid">
            {featureGroups.map((group) => (
              <article className="feature-card" key={group.number}>
                <div className="feature-card-head">
                  <span>{group.number}</span>
                  <i aria-hidden="true" />
                </div>
                <h3>{group.title}</h3>
                <p>{group.summary}</p>
                <ul>
                  {group.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="context-callout section-grid">
          <div className="context-copy">
            <span className="section-index">Context, not copy-paste</span>
            <h2>Anything you inspect can become the next precise instruction.</h2>
            <p>
              Figure annotations, PDF passages, browser selections, Zotero references, file paths, diffs and highlights all travel back to the agent with their source attached.
            </p>
            <div className="context-tags" aria-label="Supported context sources">
              <span>FIGURE</span><span>PDF</span><span>WEB</span><span>REFERENCE</span><span>FILE</span><span>DIFF</span>
            </div>
          </div>
          <div className="context-image">
            <img src="/composer.png" alt="Atelier Studio composer with project-aware context controls" />
            <div className="annotation-line" aria-hidden="true"><span /> CONTEXT ATTACHED</div>
          </div>
        </section>

        <section className="specs section-grid" id="specs">
          <div className="section-heading wide-heading">
            <span className="section-index">04 / Technical specification</span>
            <h2>Native where it matters. Local by design.</h2>
            <p>The interface, sidecar and per-project gallery work as one application while agent credentials remain on your machine.</p>
          </div>

          <div className="architecture-map" aria-label="Atelier Studio architecture">
            <div className="architecture-node primary-node">
              <span>01</span><strong>React 19 interface</strong><small>Chat, panels, editors and work surfaces</small>
            </div>
            <div className="architecture-arrow" aria-hidden="true">↔</div>
            <div className="architecture-node">
              <span>02</span><strong>Node sidecar</strong><small>WebSocket events, agents, PTY, Git, sessions, Zotero</small>
            </div>
            <div className="architecture-arrow" aria-hidden="true">↔</div>
            <div className="architecture-node accent-node">
              <span>03</span><strong>Tauri 2 shell</strong><small>Native macOS window, commands, dialogs and webviews</small>
            </div>
          </div>

          <div className="spec-table" role="table" aria-label="Atelier Studio system specifications">
            <div className="spec-row spec-head" role="row"><span role="columnheader">Specification</span><span role="columnheader">Current target</span><span role="columnheader">Notes</span></div>
            <div className="spec-row" role="row"><span role="cell">Release</span><strong role="cell">{PRODUCT.version}</strong><span role="cell">Native macOS application bundle</span></div>
            <div className="spec-row" role="row"><span role="cell">Platform</span><strong role="cell">macOS · Apple Silicon</strong><span role="cell">Current distributed target</span></div>
            <div className="spec-row" role="row"><span role="cell">Runtime</span><strong role="cell">Node.js 20+</strong><span role="cell">Frontend, sidecar and gallery tooling</span></div>
            <div className="spec-row" role="row"><span role="cell">Desktop stack</span><strong role="cell">Tauri 2 + React 19</strong><span role="cell">Rust shell, TypeScript interface</span></div>
            <div className="spec-row" role="row"><span role="cell">Agent engines</span><strong role="cell">Local CLIs + APIs</strong><span role="cell">Signed-in Claude Code and Codex CLIs recommended</span></div>
            <div className="spec-row" role="row"><span role="cell">Project gallery</span><strong role="cell">Self-contained Node server</strong><span role="cell">No Python required in the packaged app</span></div>
            <div className="spec-row" role="row"><span role="cell">Data model</span><strong role="cell">Project-scoped, local-first</strong><span role="cell">Sessions, UI state, highlights, ledger and annotations</span></div>
            <div className="spec-row" role="row"><span role="cell">Distribution</span><strong role="cell">DMG / app bundle</strong><span role="cell">Drag to Applications; unsigned development distribution</span></div>
          </div>

          <div className="limitations">
            <span>Current notes</span>
            <ul>
              <li>Apple Silicon is the current native target.</li>
              <li>Agent capabilities follow the installed CLI or configured API.</li>
              <li>PDF annotations are stored beside the file rather than burned into it.</li>
            </ul>
          </div>
        </section>

        <section className="final-cta section-grid">
          <div className="final-orbit" aria-hidden="true"><span /><span /><span /></div>
          <span className="section-index">Atelier Studio · {PRODUCT.versionLabel}</span>
          <h2>Keep the reasoning,<br />the evidence and the tools<br /><em>in one place.</em></h2>
          <div className="final-actions">
            <a className="button button-primary" href={RELEASES} target="_blank" rel="noreferrer">Download the latest release <span aria-hidden="true">↗</span></a>
            <a className="button button-secondary dark-button" href={GITHUB} target="_blank" rel="noreferrer">Explore the source <span aria-hidden="true">↗</span></a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand footer-brand" href="#top"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span><span>Atelier Studio</span></a>
        <p>Native research workspace for macOS.</p>
        <div><a href={GITHUB} target="_blank" rel="noreferrer">GitHub</a><a href={RELEASES} target="_blank" rel="noreferrer">Releases</a><a href="#top">Back to top ↑</a></div>
      </footer>
    </div>
  );
}
