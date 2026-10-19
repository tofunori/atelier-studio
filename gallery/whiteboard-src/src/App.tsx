import React, { useCallback, useRef, useState } from 'react'
import {
  Tldraw,
  type TLGeoShapeProps,
  type TLArrowShapeProps,
  getSnapshot,
  loadSnapshot,
  createShapeId,
  createBindingId,
  AssetRecordType,
  toRichText,
} from 'tldraw'
import 'tldraw/tldraw.css'

const SAVE_DEBOUNCE_MS = 1000
const POLL_MS = 1000
const LOAD_RETRY_MS = 3000
const SAVE_RETRY_MS = 5000

// Garde anti-écrasement (audit du 2026-10-18, problème 6) : le tableau reste
// en lecture seule et rien n'est enregistré avant un chargement réussi ;
// chaque sauvegarde porte la version chargée (`base`) et le serveur refuse
// (409) d'écraser un tableau changé ailleurs (autre fenêtre) depuis.
export default function App() {
  const [notice, setNotice] = useState<string | null>(null)
  // action du bandeau (conflit : garder la version de cette fenêtre)
  const noticeAction = useRef<(() => void) | null>(null)

  const handleMount = useCallback((editor) => {
    let disposed = false
    // string-id -> TLShapeId mapping so arrows can reference earlier shapes
    const idMap = new Map()
    const resolveId = (str) => {
      if (!str) return undefined
      if (!idMap.has(str)) idMap.set(str, createShapeId())
      return idMap.get(str)
    }

    // ---- 1. Initial load ----
    let loaded = false
    let baseVersion: string | null = null
    let conflict = false
    // version du disque reçue avec le 409, imposée seulement sur un clic
    let conflictVersion: string | null = null
    // identifiant de cette fenêtre : le serveur reconnaît sa propre dernière
    // écriture (beacon dont la réponse n'est jamais lue) et ne la prend pas
    // pour un conflit (relecture du 2026-10-19)
    const writer = Math.random().toString(36).slice(2) + Date.now().toString(36)
    const say = (text: string | null, action: (() => void) | null = null) => {
      noticeAction.current = action
      setNotice(text)
    }
    editor.updateInstanceState({ isReadonly: true })
    const load = () => {
      fetch('/board/load')
        .then((r) => {
          if (!r.ok) throw new Error('bad status ' + r.status)
          return r.json()
        })
        .then((data) => {
          if (disposed) return
          if (!data || !('snapshot' in data)) throw new Error('réponse sans snapshot')
          if (data.snapshot) {
            try {
              loadSnapshot(editor.store, data.snapshot)
            } catch (e) {
              // illisible pour tldraw : on n'écrase pas le fichier avec un
              // tableau vide, il reste en lecture seule
              console.warn('load_snapshot failed', e)
              say('Tableau illisible : rien ne sera enregistré par-dessus.')
              return
            }
          }
          baseVersion = typeof data.version === 'string' ? data.version : null
          loaded = true
          editor.updateInstanceState({ isReadonly: false })
          say(null)
        })
        .catch((e) => {
          if (disposed) return
          console.warn('board/load failed', e)
          say('Tableau non chargé — nouvel essai…')
          setTimeout(load, LOAD_RETRY_MS)
        })
    }
    load()

    // ---- 2. Autosave (debounced) ----
    let saveTimer = null
    const saveBody = () => JSON.stringify(baseVersion == null
      ? { snapshot: getSnapshot(editor.store) }
      : { snapshot: getSnapshot(editor.store), base: baseVersion, writer })
    const keepMine = () => {
      // choix explicite : ce tableau remplace celui du disque, qui reste
      // dans board.tldr.json.bak
      if (conflictVersion == null) return
      baseVersion = conflictVersion
      conflictVersion = null
      conflict = false
      typedInConflict = false
      say(null)
      doSave()
    }
    const doSave = () => {
      saveTimer = null
      if (!loaded || conflict) return
      fetch('/board/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: saveBody(),
      })
        .then(async (r) => {
          const data = await r.json().catch(() => null)
          if (r.status === 409) {
            conflict = true
            conflictVersion = data && typeof data.version === 'string' ? data.version : null
            say(
              'Le tableau a changé dans une autre fenêtre : ces modifications ne sont pas enregistrées (copie dans board.tldr.json.conflit). Cliquer pour garder ce tableau (l’autre ira dans board.tldr.json.bak).',
              conflictVersion != null ? keepMine : null,
            )
            return
          }
          if (!r.ok) throw new Error('bad status ' + r.status)
          if (data && typeof data.version === 'string') baseVersion = data.version
          say(null)
        })
        .catch((e) => {
          console.warn('board/save failed', e)
          say('Tableau non enregistré — nouvel essai…')
          if (!saveTimer) saveTimer = setTimeout(doSave, SAVE_RETRY_MS)
        })
    }
    // frappe arrivée pendant un conflit : envoyée à la fermeture (flushOnHide)
    let typedInConflict = false
    const unlisten = editor.store.listen(
      () => {
        if (!loaded) return
        if (conflict) {
          typedInConflict = true
          return
        }
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(doSave, SAVE_DEBOUNCE_MS)
      },
      { scope: 'document' }
    )
    // Flush a pending debounced save when the tab closes/hides (fetch would be
    // cancelled mid-flight; sendBeacon survives page teardown).
    // En conflit, le beacon part quand même avec l'ancienne base : le serveur
    // le refuse (409, tableau intact) et le garde dans board.tldr.json.conflit.
    const flushOnHide = () => {
      if (!saveTimer && !typedInConflict) return
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = null
      typedInConflict = false
      if (!loaded) return
      navigator.sendBeacon('/board/save', new Blob([saveBody()], { type: 'application/json' }))
    }
    window.addEventListener('pagehide', flushOnHide)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushOnHide()
    })

    // ---- 4. Command polling ----
    const freeSpot = (w, h) => {
      const c = editor.getViewportPageBounds().center
      return { x: c.x - w / 2, y: c.y - h / 2 }
    }

    const runCommand = async (cmd) => {
      switch (cmd.type) {
        case 'add_image': {
          const dims = await new Promise<{w: number; h: number}>((resolve) => {
            const img = new Image()
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
            img.onerror = () => resolve({ w: 300, h: 200 })
            img.src = cmd.url
          })
          let { w, h } = dims
          const longest = Math.max(w, h)
          if (longest > 600) {
            const s = 600 / longest
            w = Math.round(w * s)
            h = Math.round(h * s)
          }
          const assetId = AssetRecordType.createId()
          editor.createAssets([
            {
              id: assetId,
              type: 'image',
              typeName: 'asset',
              props: {
                name: 'image',
                src: cmd.url,
                w,
                h,
                mimeType: 'image/png',
                isAnimated: false,
              },
              meta: {},
            },
          ])
          const pos = freeSpot(w, h)
          editor.createShape({
            type: 'image',
            x: pos.x,
            y: pos.y,
            props: { assetId, w, h },
          })
          break
        }
        case 'create_rectangle':
        case 'create_ellipse': {
          const geo = cmd.type === 'create_rectangle' ? 'rectangle' : 'ellipse'
          const id = cmd.id ? resolveId(cmd.id) : createShapeId()
          const props: Partial<TLGeoShapeProps> = {
            geo,
            w: cmd.w ?? 200,
            h: cmd.h ?? 120,
            color: cmd.color || 'black',
          }
          if (cmd.label) props.richText = toRichText(String(cmd.label))
          editor.createShape({
            id,
            type: 'geo',
            x: cmd.x ?? 0,
            y: cmd.y ?? 0,
            props,
          })
          break
        }
        case 'create_text': {
          const id = cmd.id ? resolveId(cmd.id) : createShapeId()
          const size = ['s', 'm', 'l', 'xl'].includes(cmd.size) ? cmd.size : 'm'
          editor.createShape({
            id,
            type: 'text',
            x: cmd.x ?? 0,
            y: cmd.y ?? 0,
            props: {
              richText: toRichText(String(cmd.text ?? '')),
              size,
              color: cmd.color || 'black',
            },
          })
          break
        }
        case 'create_arrow': {
          const id = cmd.id ? resolveId(cmd.id) : createShapeId()
          const props: Partial<TLArrowShapeProps> = { color: cmd.color || 'black' }
          const hasEndpoints =
            cmd.fromX != null && cmd.fromY != null && cmd.toX != null && cmd.toY != null
          if (hasEndpoints) {
            props.start = { x: cmd.fromX, y: cmd.fromY }
            props.end = { x: cmd.toX, y: cmd.toY }
          }
          if (cmd.label) props.text = String(cmd.label)   // arrow labels are plain text in the schema
          editor.createShape({ id, type: 'arrow', x: 0, y: 0, props })
          // Bind to shapes when fromId/toId given
          const fromId = cmd.fromId ? resolveId(cmd.fromId) : undefined
          const toId = cmd.toId ? resolveId(cmd.toId) : undefined
          const bindings = []
          if (fromId && editor.getShape(fromId)) {
            bindings.push({
              id: createBindingId(),
              type: 'arrow',
              fromId: id,
              toId: fromId,
              props: {
                terminal: 'start',
                normalizedAnchor: { x: 0.5, y: 0.5 },
                isExact: false,
                isPrecise: false,
                snap: 'none',
              },
            })
          }
          if (toId && editor.getShape(toId)) {
            bindings.push({
              id: createBindingId(),
              type: 'arrow',
              fromId: id,
              toId: toId,
              props: {
                terminal: 'end',
                normalizedAnchor: { x: 0.5, y: 0.5 },
                isExact: false,
                isPrecise: false,
                snap: 'none',
              },
            })
          }
          if (bindings.length) editor.createBindings(bindings)
          break
        }
        case 'clear_canvas': {
          const ids = Array.from(editor.getCurrentPageShapeIds())
          if (ids.length) editor.deleteShapes(ids)
          break
        }
        case 'zoom_to_fit': {
          editor.zoomToFit()
          break
        }
        case 'load_snapshot': {
          if (cmd.snapshot) loadSnapshot(editor.store, cmd.snapshot)
          break
        }
        case 'export_png': {
          const ids = Array.from(editor.getCurrentPageShapeIds())
          if (!ids.length) break
          const { blob } = await editor.toImage(ids, { format: 'png', background: true })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = (cmd.filename || 'whiteboard') + '.png'
          document.body.appendChild(a)
          a.click()
          a.remove()
          URL.revokeObjectURL(url)
          break
        }
        default:
          console.warn('Unknown command type:', cmd.type)
      }
    }

    let pollTimer = null
    const poll = () => {
      fetch('/board/poll')
        .then((r) => r.json())
        .then(async (data) => {
          const commands = (data && data.commands) || []
          for (const cmd of commands) {
            try {
              await runCommand(cmd)
            } catch (e) {
              console.warn('command failed', cmd, e)
            }
          }
        })
        .catch((e) => console.warn('board/poll failed', e))
        .finally(() => {
          if (!disposed) pollTimer = setTimeout(poll, POLL_MS)
        })
    }
    pollTimer = setTimeout(poll, POLL_MS)

    // ---- cleanup ----
    return () => {
      disposed = true
      if (saveTimer) clearTimeout(saveTimer)
      if (pollTimer) clearTimeout(pollTimer)
      unlisten()
    }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw onMount={handleMount} />
      {notice && (
        <div
          style={{
            position: 'fixed',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(200,40,40,0.92)',
            color: 'white',
            padding: '6px 14px',
            borderRadius: 6,
            fontSize: 13,
            fontFamily: 'sans-serif',
            zIndex: 999999,
            pointerEvents: noticeAction.current ? 'auto' : 'none',
            cursor: noticeAction.current ? 'pointer' : 'default',
          }}
          role={noticeAction.current ? 'button' : 'status'}
          tabIndex={noticeAction.current ? 0 : undefined}
          onClick={() => noticeAction.current?.()}
          onKeyDown={(event) => {
            if (noticeAction.current && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault()
              noticeAction.current()
            }
          }}
        >
          {notice}
        </div>
      )}
    </div>
  )
}
