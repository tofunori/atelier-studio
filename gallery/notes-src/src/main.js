import { Crepe } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/nord-dark.css'
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
const indicator = document.getElementById('save-indicator')

function showSaveFailed(failed) {
  indicator.classList.toggle('show', failed)
}

async function main() {
  // ---- 1. Initial load ----
  let initial = ''
  try {
    const r = await fetch('/notes/load')
    const data = await r.json()
    if (data && typeof data.markdown === 'string') initial = data.markdown
  } catch (e) {
    console.warn('notes/load failed', e)
  }

  const appEl = document.getElementById('app')
  const sourceEl = document.getElementById('source')
  const toolbar = document.getElementById('toolbar')

  // Crepe instance is recreated when switching back from source mode with
  // changed content, so keep it mutable and factor creation into a function.
  let crepe = null
  const createCrepe = async (content) => {
    crepe = new Crepe({ root: appEl, defaultValue: content })
    await crepe.create()
    crepe.on((api) => {
      api.markdownUpdated(() => scheduleSave())
    })
  }
  await createCrepe(initial)

  // ---- 1b. Top toolbar ----
  const run = (command, payload) =>
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
    if (e.target.closest('button')) e.preventDefault()
  })
  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('button')
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
  let mode = 'rich'
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
    }
    modeBtns.rich.classList.toggle('active', mode === 'rich')
    modeBtns.source.classList.toggle('active', mode === 'source')
  }

  // Textarea edits participate in the same debounced autosave
  sourceEl.addEventListener('input', () => scheduleSave())

  // ---- 2. Autosave (debounced) ----
  let saveTimer = null
  const doSave = () => {
    saveTimer = null
    const markdown = currentMarkdown()
    fetch('/notes/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown }),
    })
      .then((r) => {
        if (!r.ok) throw new Error('bad status ' + r.status)
        showSaveFailed(false)
      })
      .catch((e) => {
        console.warn('notes/save failed', e)
        showSaveFailed(true)
      })
  }
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(doSave, SAVE_DEBOUNCE_MS)
  }

  // ---- 3. Flush pending save on hide via sendBeacon ----
  const flushOnHide = () => {
    if (!saveTimer) return
    clearTimeout(saveTimer)
    saveTimer = null
    const body = JSON.stringify({ markdown: currentMarkdown() })
    navigator.sendBeacon('/notes/save', new Blob([body], { type: 'application/json' }))
  }
  window.addEventListener('pagehide', flushOnHide)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushOnHide()
  })
}

main()
