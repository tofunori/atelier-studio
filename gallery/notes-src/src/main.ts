import { Crepe } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
// Plus de thème Nord (GAP-01) : les --crepe-color-* sont dérivés des jetons
// d'Atelier dans index.html, qui charge le pont de thème.
import { editorViewCtx } from '@milkdown/kit/core'
import { callCommand } from '@milkdown/kit/utils'
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  wrapInHeadingCommand,
  turnIntoTextCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  createCodeBlockCommand,
  insertHrCommand,
  toggleLinkCommand,
} from '@milkdown/kit/preset/commonmark'
import { toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm'

const SAVE_DEBOUNCE_MS = 1000
const LOAD_RETRY_MS = 3000
const SAVE_RETRY_MS = 5000
const indicator = document.getElementById('save-indicator')

// Garde anti-écrasement (audit du 2026-10-18, problème 6) : l'éditeur ne
// monte qu'après un chargement réussi, chaque sauvegarde porte la version
// chargée (`base`) et le serveur refuse (409) d'écraser un notes.md changé
// ailleurs depuis — par un agent, par exemple.
//
// Statut (GAP-05) : une capsule sobre. « nouvel essai » tourne en silence
// (busy) ; seul le conflit, qui attend un choix, prend le point d'erreur et
// un bouton explicite au lieu d'une étiquette rouge cliquable.
const SPIN = '<svg class="ind-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M8 2a6 6 0 1 0 6 6"/></svg>'
type IndicatorAction = { label: string; run: () => void }
function showIndicator(
  text: string | null,
  options: { busy?: boolean; error?: boolean; action?: IndicatorAction } = {},
) {
  // masquer garde le contenu le temps du fondu : la capsule ne se vide pas en partant
  indicator.classList.toggle('show', text != null)
  if (text == null) return
  indicator.replaceChildren()
  indicator.classList.toggle('error', !!options.error)
  if (options.busy) indicator.insertAdjacentHTML('beforeend', SPIN)
  if (options.error) {
    const dot = document.createElement('span')
    dot.className = 'ind-dot'
    indicator.append(dot)
  }
  const label = document.createElement('span')
  label.className = 'ind-text'
  label.textContent = text
  indicator.append(label)
  if (options.action) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'ind-act'
    button.textContent = options.action.label
    button.addEventListener('click', options.action.run)
    indicator.append(button)
  }
}

async function loadNotes(): Promise<{ markdown: string; version: string | null }> {
  for (;;) {
    try {
      const r = await fetch('/notes/load')
      if (!r.ok) throw new Error('bad status ' + r.status)
      const data = await r.json()
      if (data && typeof data.markdown === 'string') {
        return { markdown: data.markdown, version: typeof data.version === 'string' ? data.version : null }
      }
      throw new Error('réponse sans markdown')
    } catch (e) {
      // jamais un document vide à la place du fichier : on attend le serveur
      console.warn('notes/load failed', e)
      showIndicator('Notes non chargées, nouvel essai…', { busy: true })
      await new Promise((resolve) => setTimeout(resolve, LOAD_RETRY_MS))
    }
  }
}

async function main() {
  // ---- 1. Initial load ----
  const loaded = await loadNotes()
  showIndicator(null)
  const initial = loaded.markdown
  let baseVersion = loaded.version
  // identifiant de cette fenêtre : le serveur reconnaît sa propre dernière
  // écriture (beacon dont la réponse n'est jamais lue) et ne la prend pas
  // pour un conflit (relecture du 2026-10-19)
  const writer = Math.random().toString(36).slice(2) + Date.now().toString(36)
  // version du disque reçue avec un 409 : en attente de la décision
  let conflictVersion: string | null = null

  const appEl = document.getElementById('app')
  const sourceEl = document.getElementById('source') as HTMLTextAreaElement
  const toolbar = document.getElementById('toolbar')

  // Crepe instance is recreated when switching back from source mode with
  // changed content, so keep it mutable and factor creation into a function.
  let crepe = null
  let mode = 'rich'
  const createCrepe = async (content) => {
    crepe = new Crepe({
      root: appEl,
      defaultValue: content,
      // Interface en français (GAP-06) : texte d'attente et menu « / »
      featureConfigs: {
        [Crepe.Feature.Placeholder]: { text: 'Écrire, ou « / » pour insérer un bloc…' },
        [Crepe.Feature.BlockEdit]: {
          textGroup: {
            label: 'Texte',
            text: { label: 'Paragraphe' },
            h1: { label: 'Titre 1' },
            h2: { label: 'Titre 2' },
            h3: { label: 'Titre 3' },
            h4: { label: 'Titre 4' },
            h5: { label: 'Titre 5' },
            h6: { label: 'Titre 6' },
            quote: { label: 'Citation' },
            divider: { label: 'Séparateur' },
          },
          listGroup: {
            label: 'Listes',
            bulletList: { label: 'Liste à puces' },
            orderedList: { label: 'Liste numérotée' },
            taskList: { label: 'Liste de tâches' },
          },
          advancedGroup: {
            label: 'Avancé',
            image: { label: 'Image' },
            codeBlock: { label: 'Bloc de code' },
            table: { label: 'Tableau' },
            math: { label: 'Formule' },
          },
        },
      },
    })
    await crepe.create()
    crepe.on((api) => {
      api.markdownUpdated(() => scheduleSave())
      // la barre suit la sélection (GAP-03) : gras, titre, liste…
      api.selectionUpdated(() => paintToolbar())
      api.updated(() => paintToolbar())
    })
    paintToolbar()
  }

  // ---- État de la barre : reflète les marques et blocs sous le curseur ----
  const fmtButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('#toolbar button[data-cmd]'))
  const markActive = (state, name: string) => {
    const type = state.schema.marks[name]
    if (!type) return false
    const { from, to, empty, $from } = state.selection
    if (empty) return !!type.isInSet(state.storedMarks || $from.marks())
    return state.doc.rangeHasMark(from, to, type)
  }
  const blockState = (state) => {
    const { $from } = state.selection
    const out: Record<string, boolean> = {}
    const parent = $from.parent
    if (parent.type.name === 'heading') out['h' + parent.attrs.level] = true
    if (parent.type.name === 'paragraph') out.paragraph = true
    if (parent.type.name === 'code_block') out.code = true
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth)
      const name = node.type.name
      if (name === 'blockquote') out.quote = true
      if (name === 'list_item' && node.attrs.checked != null) { out.task = true; break }
      if (name === 'bullet_list') { out.bullet = true; break }
      if (name === 'ordered_list') { out.ordered = true; break }
    }
    if (out.task) delete out.bullet
    return out
  }
  function paintToolbar() {
    if (!crepe || mode === 'source') return
    let state
    try {
      crepe.editor.action((ctx) => { state = ctx.get(editorViewCtx).state })
    } catch { return }
    if (!state) return
    const blocks = blockState(state)
    const marks: Record<string, boolean> = {
      bold: markActive(state, 'strong'),
      italic: markActive(state, 'emphasis'),
      strike: markActive(state, 'strike_through'),
      link: markActive(state, 'link'),
    }
    for (const button of fmtButtons) {
      const cmd = button.dataset.cmd
      if (cmd === 'hr') continue
      button.setAttribute('aria-pressed', String(!!(marks[cmd] ?? blocks[cmd])))
    }
  }
  await createCrepe(initial)

  // ---- 1b. Top toolbar ----
  const run = (command, payload?) =>
    crepe.editor.action(callCommand(command.key, payload))

  // Task list has no dedicated command in this Milkdown version: wrap the
  // selection in a bullet list, then flag each list_item as a checkbox item
  // (checked attr set -> GFM renders it as a task item).
  const makeTaskList = () => {
    crepe.editor.action((ctx) => {
      callCommand(wrapInBulletListCommand.key)(ctx)
      const view = ctx.get(editorViewCtx)
      const { state } = view
      const { from, to } = state.selection
      const tr = state.tr
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name === 'list_item' && node.attrs.checked == null) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: false })
        }
      })
      if (tr.docChanged) view.dispatch(tr)
    })
  }

  const actions = {
    paragraph: () => run(turnIntoTextCommand),
    h1: () => run(wrapInHeadingCommand, 1),
    h2: () => run(wrapInHeadingCommand, 2),
    h3: () => run(wrapInHeadingCommand, 3),
    bold: () => run(toggleStrongCommand),
    italic: () => run(toggleEmphasisCommand),
    strike: () => run(toggleStrikethroughCommand),
    bullet: () => run(wrapInBulletListCommand),
    ordered: () => run(wrapInOrderedListCommand),
    task: makeTaskList,
    quote: () => run(wrapInBlockquoteCommand),
    code: () => run(createCodeBlockCommand),
    link: () => run(toggleLinkCommand),
    hr: () => run(insertHrCommand),
  }

  toolbar.addEventListener('mousedown', (e) => {
    // never steal focus from the editor
    if ((e.target as Element).closest('button')) e.preventDefault()
  })
  toolbar.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest('button')
    if (!btn) return
    if (btn.dataset.mode) {
      setMode(btn.dataset.mode)
      return
    }
    if (mode === 'source') return // formatting inert in source mode
    const fn = actions[btn.dataset.cmd]
    if (!fn) return
    fn()
    crepe.editor.action((ctx) => ctx.get(editorViewCtx).focus())
  })

  // ---- 1c. Source ↔ WYSIWYG toggle ----
  const modeBtns = {
    rich: toolbar.querySelector('button[data-mode="rich"]'),
    source: toolbar.querySelector('button[data-mode="source"]'),
  }
  const currentMarkdown = () =>
    mode === 'source' ? sourceEl.value : crepe.getMarkdown()

  const setMode = async (next) => {
    if (next === mode) return
    if (next === 'source') {
      sourceEl.value = crepe.getMarkdown()
      mode = 'source'
      document.body.classList.add('source-mode')
      toolbar.classList.add('source-mode')
      sourceEl.focus()
    } else {
      // back to rich: rebuild only if the source text changed
      const changed = sourceEl.value !== crepe.getMarkdown()
      if (changed) {
        await crepe.destroy()
        await createCrepe(sourceEl.value)
        scheduleSave()
      }
      mode = 'rich'
      document.body.classList.remove('source-mode')
      toolbar.classList.remove('source-mode')
      paintToolbar()
    }
    modeBtns.rich.setAttribute('aria-pressed', String(mode === 'rich'))
    modeBtns.source.setAttribute('aria-pressed', String(mode === 'source'))
  }

  // Textarea edits participate in the same debounced autosave
  sourceEl.addEventListener('input', () => scheduleSave())

  // ---- 2. Autosave (debounced) ----
  let saveTimer = null
  // frappe arrivée pendant un conflit : envoyée à la fermeture (voir flushOnHide)
  let typedInConflict = false
  const saveBody = () => JSON.stringify(baseVersion == null
    ? { markdown: currentMarkdown() }
    : { markdown: currentMarkdown(), base: baseVersion, writer })
  // le serveur garde aussi chaque version refusée dans notes.md.conflit
  const conflictMessage = 'notes.md a changé ailleurs : ta version reste ici, non enregistrée (copie dans notes.md.conflit). La garder remplace l’autre, qui ira dans notes.md.bak.'
  const keepMine = () => {
    // choix explicite : la version de l'onglet remplace celle du disque,
    // qui reste dans notes.md.bak
    baseVersion = conflictVersion
    conflictVersion = null
    typedInConflict = false
    showIndicator(null)
    doSave()
  }
  const doSave = () => {
    saveTimer = null
    // conflit en attente : rien ne part tant que l'utilisateur n'a pas choisi
    if (conflictVersion != null) return
    fetch('/notes/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: saveBody(),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => null)
        if (r.status === 409 && data && typeof data.version === 'string') {
          conflictVersion = data.version
          showIndicator(conflictMessage, { error: true, action: { label: 'Garder cette version', run: keepMine } })
          return
        }
        if (!r.ok) throw new Error('bad status ' + r.status)
        if (data && typeof data.version === 'string') baseVersion = data.version
        showIndicator(null)
      })
      .catch((e) => {
        console.warn('notes/save failed', e)
        showIndicator('Notes non enregistrées, nouvel essai…', { busy: true })
        if (!saveTimer) saveTimer = setTimeout(doSave, SAVE_RETRY_MS)
      })
  }
  const scheduleSave = () => {
    if (conflictVersion != null) typedInConflict = true
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(doSave, SAVE_DEBOUNCE_MS)
  }

  // ---- 3. Flush pending save on hide via sendBeacon ----
  // En conflit, le beacon part quand même avec l'ancienne base : le serveur
  // le refuse (409, notes.md intact) et garde le texte dans notes.md.conflit,
  // si bien que la frappe d'un onglet fermé sans choisir n'est pas perdue.
  const flushOnHide = () => {
    if (!saveTimer && !typedInConflict) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    typedInConflict = false
    navigator.sendBeacon('/notes/save', new Blob([saveBody()], { type: 'application/json' }))
  }
  window.addEventListener('pagehide', flushOnHide)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushOnHide()
  })
}

main()
