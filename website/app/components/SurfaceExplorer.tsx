"use client";
import { useState } from 'react';
const surfaces = [
    { id: 'workspace', name: 'Conversations', description: 'Plan a question and develop it with an agent, inside the project.' },
    { id: 'editor', name: 'Code editor', description: 'Read and edit the scripts behind your work.' },
    { id: 'reading', name: 'PDF reader', description: 'Keep documents and figures close to the conversation.' },
    { id: 'gallery', name: 'Figure gallery', description: 'Browse the visual outputs of a project in one place.' },
    { id: 'settings', name: 'Settings', description: 'Choose the appearance and tools that fit your way of working.' },
];
export default function SurfaceExplorer() {
    const [active, setActive] = useState(surfaces[0]);
    return <div className="surface-explorer">
  <div className="surface-controls" role="group" aria-label="Workspace surfaces">{surfaces.map(s => <button key={s.id} aria-pressed={active.id === s.id} onClick={() => setActive(s)}>{s.name}</button>)}</div>
  <figure><a href={`/media/${active.id}.png`} target="_blank" rel="noreferrer" aria-label={`Open full-size ${active.name} screenshot`}><img src={`/media/${active.id}.png`} width="1600" height="1000" alt={`Atelier ${active.name}, showing the fictional Observatory project`} loading="lazy"/></a><figcaption aria-live="polite"><span>{active.description}</span><span>Fictional demo project · Open image to enlarge</span></figcaption></figure>
 </div>;
}
