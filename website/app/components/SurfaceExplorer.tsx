"use client";
import { assetPath } from '../site';

import { useState } from 'react';
const surfaces = [
    { id: 'annotation', name: 'Figure annotation', description: 'Mark a detail in a scientific figure and draft precise feedback for revision.' },
    { id: 'latex', name: 'LaTeX reading view', description: 'Review thesis prose and equations in reading mode, beside the conversation.' },
    { id: 'workspace', name: 'Conversations', description: 'Develop a research question with an agent and context from your project.' },
    { id: 'editor', name: 'Code editor', description: 'Read and edit the analysis scripts behind your figures.' },
    { id: 'reading', name: 'PDF reader', description: 'Read a scientific paper with prose, equations, and source notes beside the conversation.' },
    { id: 'gallery', name: 'Figure gallery', description: 'Compare analysis outputs in a gallery, shown here with twelve synthetic figures.' },
    { id: 'settings', name: 'Settings', description: 'Choose the appearance and tools that fit your way of working.' },
];
export default function SurfaceExplorer() {
    const [active, setActive] = useState(surfaces[0]);
    return <div className="surface-explorer">
  <div className="surface-controls" role="group" aria-label="Workspace surfaces">{surfaces.map(s => <button key={s.id} aria-pressed={active.id === s.id} onClick={() => setActive(s)}>{s.name}</button>)}</div>
  <figure><a href={assetPath(`/media/${active.id}.png`)} target="_blank" rel="noreferrer" aria-label={`Open full-size ${active.name} screenshot`}><img src={assetPath(`/media/${active.id}.png`)} width="1600" height="1000" alt={`Atelier ${active.name}, showing the fictional Observatory project`} loading="lazy"/></a><figcaption aria-live="polite"><span>{active.description}</span><span>Fictional demo project · Open image to enlarge</span></figcaption></figure>
 </div>;
}
