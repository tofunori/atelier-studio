import { useEffect, useState, type ReactNode } from "react"

// Même modèle que LazyDropdownMenu : le composant résolu est stocké au niveau
// module. Une fois le chunk arrivé, tout rendu suivant est synchrone — plus de
// faux dialogue en ligne (sans portail ni voile) peint pendant une frame avant
// la vraie modale (audit PRIM-27). Avant l'arrivée du chunk : rien, jamais un
// substitut au mauvais endroit. Vite code-splitte toujours grâce à l'import
// dynamique.
let LoadedSurface: typeof import("./DialogSurface").DialogSurface | null = null
const dialogModule = import("./DialogSurface").then((module) => {
  LoadedSurface = module.DialogSurface
  return module
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
  const [ready, setReady] = useState(LoadedSurface != null)

  useEffect(() => {
    if (ready) return
    let alive = true
    void dialogModule.then(() => {
      if (alive) setReady(true)
    })
    return () => {
      alive = false
    }
  }, [ready])

  if (!ready || LoadedSurface == null) return null
  const Surface = LoadedSurface
  return <Surface {...props} />
}
