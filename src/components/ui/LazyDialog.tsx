import { lazy, Suspense, useEffect, useId, useState, type ReactNode } from "react"

const dialogModule = import("./DialogSurface")
const DialogSurface = lazy(async () => {
  const module = await dialogModule
  return { default: module.DialogSurface }
})

export function LazyDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  closeLabel?: string
  className?: string
  children: ReactNode
}) {
  const [ready, setReady] = useState(false)
  const titleId = useId()

  useEffect(() => {
    void dialogModule.then(() => setReady(true))
  }, [])

  if (!ready) {
    return (
      <div
        className={props.className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === "Escape") props.onOpenChange(false)
        }}
      >
        <div className="provider-new-head">
          <div>
            <h2 id={titleId}>{props.title}</h2>
            {props.description != null && <p>{props.description}</p>}
          </div>
          <button type="button" className="ghost" onClick={() => props.onOpenChange(false)}>
            {props.closeLabel ?? "Close"}
          </button>
        </div>
        {props.children}
      </div>
    )
  }

  return (
    <Suspense fallback={null}>
      <DialogSurface {...props} />
    </Suspense>
  )
}
