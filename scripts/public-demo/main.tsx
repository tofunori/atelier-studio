// Public media harness. Only fictional fixtures; no backend, filesystem or account connection.
import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles/tokens.css';
import '../../src/styles/shadcn.css';
import '@fontsource-variable/inter';
import '../../src/styles/typeset.css';
import '../../src/styles/primitives.css';
import '../../src/App.css';
import '../../src/styles/settings-sheet.css';
import Chat from '../../src/components/Chat';
import Sidebar from '../../src/components/Sidebar';
import { SettingsSheet } from '../../src/components/settings/SettingsSheet';
import WorkspaceShell from '../../src/components/shell/WorkspaceShell';
import TopBar from '../../src/components/TopBar';
import Rail from '../../src/components/Rail';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { DEFAULT_SETTINGS, type Settings } from '../../src/lib/settings';
import { interfaceGeometry, interfaceTypography } from '../../src/lib/interfaceTheme';
import { presetById } from '../../src/lib/themes';
import type { AgentEvent, Thread } from '../../src/lib/ws';
import type { ProviderInfo } from '../../src/lib/providers';
const noop = () => { };
const project = '/demo/Observatory';
const now = Date.now();
const topics = ['A clearer research question', 'A first draft, with context', 'Review the visual story'];
const threads = topics.map((title, i) => ({ id: String(i), title, projectRoot: project, provider: 'codex', sessionId: null, status: 'idle', updatedAt: new Date(now - i * 60000).toISOString() })) as Thread[];
const providers: ProviderInfo[] = [{ id: 'codex', label: 'Codex', kind: 'cli', version: 'demo', ok: true, models: ['gpt-5.5'], defaultModel: 'gpt-5.5', efforts: ['low', 'medium', 'high'], capabilities: { resume: true, steering: true, queue: true, goals: true, tools: true, toolOutput: true, permissions: true, permissionModes: ['default'] } }];
const conversations: AgentEvent[][] = [
    [
        { kind: 'user', text: 'Help me turn this idea into a focused research plan. Start with the question, then outline the next steps.', ts: now - 60000 },
        { kind: 'tool_update', id: 'read', name: 'Read', detail: 'Project brief', output: 'Demonstration brief reviewed. All content in this workspace is fictional.', input: {}, status: 'completed', durationMs: 840, ts: now - 55000 },
        { kind: 'text', text: '## Start with one clear question\n\nHow does the choice of observation window affect the patterns we see in a time series?\n\nThis gives the project a manageable scope and a comparison we can explain.\n\n### A practical sequence\n\n1. **Define the comparison.** Choose two observation windows and keep the measurement method fixed.\n2. **Explore the examples.** Look at the same synthetic series at both scales.\n3. **Write down the limits.** Separate what the illustration shows from what would require real observations.\n\nWe can keep the brief, draft, and visual review together as the project develops.', ts: now - 50000 },
    ],
    [
        { kind: 'user', text: 'Draft a short introduction from our project brief. Keep the language precise and flag anything that needs a source.', ts: now - 60000 },
        { kind: 'text', text: '## A first draft\n\nThe scale at which a time series is observed shapes the patterns available for interpretation. Short windows preserve local variation, while longer windows make broad changes easier to see.\n\nThis demonstration compares two observation windows using synthetic data. Its purpose is to illustrate a workflow, rather than establish an empirical result.\n\n> **Source needed:** add a methodological reference before making a general claim about aggregation.\n\n### What to check next\n\n- Define the observation window in the methods.\n- Use the same terminology in the figure caption.\n- Keep the distinction between illustration and evidence explicit.', ts: now - 50000 },
    ],
    [
        { kind: 'user', text: 'Review the figure presentation. I want the message to be clear before adding more detail.', ts: now - 60000 },
        { kind: 'text', text: '## Let the comparison lead\n\nKeep both panels on the same scale, use direct labels, and move the methodological detail into the caption.\n\n| Element | Suggested change |\n|---|---|\n| Title | Describe the comparison in plain language |\n| Axes | Match limits and units across panels |\n| Colour | Reserve the accent for the observation window |\n| Caption | State that the example uses synthetic data |\n\n### Ready for another pass\n\nThe next review can focus on the revised figure. Attach it to the conversation and point to the area you want to refine.', ts: now - 50000 },
    ],
] as AgentEvent[][];
function Demo() {
    const params = new URLSearchParams(location.search);
    const [active, setActive] = useState('0');
    const [scene, setScene] = useState(params.get('scene') ?? 'reading');
    const [showSettings, setShowSettings] = useState(params.get('scene') === 'settings');
    const [compact, setCompact] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [layout, setLayout] = useState<'chat' | 'split' | 'atelier'>('split');
    const port = params.get('port');
    const origin = 'http://127.0.0.1:' + (/^\d+$/.test(port ?? '') ? port : '4201');
    const root = '/private/tmp/atelier-public-demo/Observatory';
    const urls = { paper: origin + '/.fig_thumbs/pdf_viewer.html?file=.fig_thumbs/brms-2017.pdf', latex: origin + '/.fig_thumbs/latex_studio.html?path=' + encodeURIComponent(root + '/manuscript.tex') + '&embedded=atelier', annotation: origin + '/figures_index.html', gallery: origin + '/figures_index.html', editor: origin + '/.fig_thumbs/code_editor.html?path=' + encodeURIComponent(root + '/analysis.py'), reading: origin + '/.fig_thumbs/pdf_viewer.html?file=observation-windows.pdf' };
    const surface = scene in urls ? scene as keyof typeof urls : 'reading';
    const tabs = [{ id: 'paper', title: 'brms-2017.pdf', kind: 'document' as const }, { id: 'latex', title: 'manuscript.tex', kind: 'document' as const }, { id: 'reading', title: 'observation-windows.pdf', kind: 'document' as const }, { id: 'editor', title: 'analysis.py', kind: 'document' as const }, { id: 'gallery', title: 'Gallery', kind: 'surface' as const, surface: 'atelier' as const }];
    const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS, language: 'en' as const, themePreset: params.get('theme') ?? 'graphite' });
    const theme = presetById(settings.themePreset);
    const frameRef = useRef<HTMLIFrameElement>(null);
    const syncTheme = () => {
        const v = theme.vars;
        frameRef.current?.contentWindow?.postMessage({ type: 'atelier-theme', version: 2, colorScheme: 'dark', vars: { ...v,
                '--surface-app': v['--bg'], '--surface-panel': v['--bg'], '--surface-header': v['--bg'], '--surface-raised': v['--bg-card'], '--surface-inset': v['--bg-ctl'],
                '--text-primary': v['--fg'], '--text-secondary': v['--fg2'], '--text-tertiary': v['--muted'], '--text-disabled': v['--muted2'],
                '--border-subtle': v['--border'], '--border-interactive': v['--border2'], ...interfaceGeometry(getComputedStyle(document.documentElement)), ...interfaceTypography(settings.baseFontSize),
                '--ui-font': "-apple-system, 'SF Pro Text', 'Inter Variable', sans-serif", '--code-font': "ui-monospace, 'SF Mono', Menlo, monospace"
            } }, origin);
    };
    useEffect(() => { Object.entries(theme.vars).forEach(([key, value]) => document.documentElement.style.setProperty(key, value)); syncTheme(); }, [theme]);
    return <WorkspaceShell dragging={dragging} onDraggingChange={setDragging} topBar={<TopBar projects={[project]} projMeta={{}} activeProject={project} onSelectProject={noop} onAddProject={noop} layout={layout} onSetLayout={setLayout} onOpenPalette={noop} onQuickAsk={noop} activeSurface="atelier" showAtelier={layout !== 'chat'} showExplorer={false} showAnnots={false} onToggleExplorer={noop} onToggleAnnots={noop} onSelectSurface={() => setScene('gallery')} onSelectIde={() => setScene('editor')} ideActive={scene === 'editor'} tabs={tabs} activeTab={surface} onSelectTab={setScene} onCloseTab={noop}/>} rail={<Rail projects={[project]} activeProject={project} meta={{}} running={new Set()} activeView="chats" compact={compact} onNewChat={noop} onSelectView={noop} onSelectProject={noop} onAddProject={noop} onExpand={() => setCompact(!compact)} onSettings={() => setShowSettings(true)} onSetMeta={noop} onRemoveProject={noop} onReorder={noop}/>} viewPanel={compact ? null : <Sidebar projects={[project]} threads={threads} unread={new Set()} favorites={[]} onToggleFavorite={noop} threadOrder="recent" activeProject={project} activeId={active} onSelect={setActive} onNew={noop} onNewChat={noop} onImportSession={noop} onDelete={noop} onRemoveProject={noop} onRename={noop} projMeta={{}} onSetMeta={noop}/>} overlays={<SettingsSheet open={showSettings} settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} ws={null} initialSection="apparence"/>}>
 <PanelGroup direction="horizontal" className="app">
 <Panel defaultSize={43} minSize={30} style={{ display: layout === 'atelier' ? 'none' : undefined }}><Chat events={conversations[Number(active)] ?? conversations[0]} workingSince={null} commands={[]} files={[]} recentFiles={[]} zoteroItems={[]} injectText={null} onInjected={noop} attachments={[]} onRemoveAttachment={noop} onQuote={noop} threadId={active} threadTitle={topics[Number(active)]} threadProvider="codex" onPasteImage={noop} onPasteText={noop} onStop={noop} layout={layout} onToggleExpand={noop} usage={null} onRevert={noop} onFork={noop} onEditSend={noop} onNewChat={noop} onOpenProject={noop} highlights={[]} defaults={{ defaultProvider: 'codex', defaultModel: {}, defaultEffort: {}, defaultPermissionMode: 'default' }} providers={providers} pins={[]} onStylePin={noop} onTogglePin={noop} disabled={false} onSubmit={noop} onGoal={noop}/></Panel>
 <PanelResizeHandle className="handle"/>
 <Panel defaultSize={57} minSize={30} style={{ display: layout === 'chat' ? 'none' : undefined }}><iframe ref={frameRef} onLoad={syncTheme} title="Project surface" src={urls[surface]} style={{ width: '100%', height: '100%', border: 0, display: 'block' }}/></Panel>
 </PanelGroup>
 </WorkspaceShell>;
}
createRoot(document.getElementById('root')!).render(<Demo />);
