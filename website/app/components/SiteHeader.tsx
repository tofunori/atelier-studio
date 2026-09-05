"use client";
import { assetPath } from '../site';

import { useState } from 'react';
export default function SiteHeader() {
    const [open, setOpen] = useState(false);
    return <header className="site-header"><a className="wordmark" href="#"><img src={assetPath("/atelier-icon.png")} width="32" height="32" alt=""/>Atelier<span>Studio</span></a><button className="menu-toggle" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Menu'}</button><nav id="site-nav" className={open ? 'is-open' : ''} aria-label="Main navigation"><a href="#workspace" onClick={() => setOpen(false)}>Workspace</a><a href="#appearance" onClick={() => setOpen(false)}>Appearance</a><a href="#download" onClick={() => setOpen(false)}>Download</a><a href="https://github.com/tofunori/atelier-studio">GitHub ↗</a></nav></header>;
}
