"use client";
import { assetPath } from '../site';

import { useState } from 'react';
const themes = [{ id: 'graphite', name: 'Graphite', color: '#ca926b' }, { id: 'pierre', name: 'Pierre', color: '#bba889' }, { id: 'monokai', name: 'Monokai', color: '#a6e22e' }];
export default function ThemePreview() {
    const [theme, setTheme] = useState(themes[0]);
    return <div><div className="theme-controls" role="group" aria-label="Preview an Atelier theme">{themes.map(t => <button key={t.id} aria-pressed={theme.id === t.id} onClick={() => setTheme(t)}><span style={{ background: t.color }}/>{t.name}</button>)}</div><figure className="theme-image"><img src={assetPath(`/media/${theme.id}.png`)} width="1600" height="1000" alt={`The Atelier conversation surface in ${theme.name}, with fictional demo content`} loading="lazy"/><figcaption aria-live="polite">{theme.name} · Captured in Atelier</figcaption></figure></div>;
}
