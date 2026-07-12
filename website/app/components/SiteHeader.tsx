"use client";

import { useState } from "react";

export function SiteHeader({ github, releases }: { github: string; releases: string }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="Atelier Studio home">
        <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
        <span>Atelier Studio</span>
      </a>

      <button
        className="menu-button"
        type="button"
        aria-label="Toggle navigation"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((value) => !value)}
      >
        <span />
        <span />
      </button>

      <nav className={menuOpen ? "site-nav is-open" : "site-nav"} aria-label="Primary navigation">
        <a href="#workflow" onClick={() => setMenuOpen(false)}>Workflow</a>
        <a href="#surfaces" onClick={() => setMenuOpen(false)}>Surfaces</a>
        <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
        <a href="#specs" onClick={() => setMenuOpen(false)}>Specs</a>
      </nav>

      <a className="header-cta" href={releases} target="_blank" rel="noreferrer">
        Get Atelier <span aria-hidden="true">↗</span>
      </a>
      <span className="sr-only">Source repository: {github}</span>
    </header>
  );
}
