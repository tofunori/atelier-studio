import React, { useCallback, useRef, useState } from 'react'
import {
  Tldraw,
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

export default function App() {
  const [saveFailed, setSaveFailed] = useState(false)

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
    fetch('/board/load')
      .then((r) => r.json())
      .then((data) => {
        if (disposed) return
        if (data && data.snapshot) {
          try {
            loadSnapshot(editor.store, data.snapshot)
          } catch (e) {
            console.warn('load_snapshot failed', e)
          }
        }
      })
      .catch((e) => console.warn('board/load failed', e))

    // ---- 2. Autosave (debounced) ----
    let saveTimer = null
    const doSave = () => {
      const snapshot = getSnapshot(editor.store)
      fetch('/board/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot }),
      })
        .then((r) => {
          if (!r.ok) throw new Error('bad status ' + r.status)
          setSaveFailed(false)
        })
        .catch((e) => {
          console.warn('board/save failed', e)
          setSaveFailed(true)
        })
    }
    const unlisten = editor.store.listen(
      () => {
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(doSave, SAVE_DEBOUNCE_MS)
      },
      { scope: 'document' }
    )
    // Flush a pending debounced save when the tab closes/hides (fetch would be
    // cancelled mid-flight; sendBeacon survives page teardown).
    const flushOnHide = () => {
      if (!saveTimer) return
      clearTimeout(saveTimer)
      saveTimer = null
      const body = JSON.stringify({ snapshot: getSnapshot(editor.store) })
      navigator.sendBeacon('/board/save', new Blob([body], { type: 'application/json' }))
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
          const dims = await new Promise((resolve) => {
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
          const props = {
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
          const props = { color: cmd.color || 'black' }
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
      {saveFailed && (
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
            pointerEvents: 'none',
          }}
        >
          save failed — will retry
        </div>
      )}
    </div>
  )
}
