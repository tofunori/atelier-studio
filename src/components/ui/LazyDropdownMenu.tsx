import {
  cloneElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type MouseEvent,
  type MouseEventHandler,
  type ReactNode,
  type RefObject,
} from "react"
import type {
  DropdownMenuSurfaceGroup,
  DropdownMenuSurfaceItem,
} from "./DropdownMenuSurface"

// Composant résolu stocké au niveau module (pas de React.lazy/Suspense : on
// piste déjà le chargement nous-mêmes — une fois le chunk arrivé, le rendu
// est entièrement synchrone, sans fallback non câblé). Vite code-splitte
// toujours grâce à l'import dynamique.
let LoadedSurface: typeof import("./DropdownMenuSurface").DropdownMenuSurface | null = null
const dropdownMenuModule = import("./DropdownMenuSurface").then((module) => {
  LoadedSurface = module.DropdownMenuSurface
  return module
})

export type LazyDropdownMenuItem = Omit<DropdownMenuSurfaceItem, "children"> & {
  children?: LazyDropdownMenuItem[]
}

export type LazyDropdownMenuGroup = Omit<DropdownMenuSurfaceGroup, "items"> & {
  items: LazyDropdownMenuItem[]
}

export function LazyDropdownMenu(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactElement
  triggerRef?: RefObject<HTMLButtonElement | null>
  label?: string
  align?: "start" | "center" | "end"
  side?: "top" | "right" | "bottom" | "left"
  sideOffset?: number
  className?: string
  header?: ReactNode
  footer?: ReactNode
  items?: LazyDropdownMenuItem[]
  groups?: LazyDropdownMenuGroup[]
}) {
  const fallbackAnchorRef = useRef<HTMLButtonElement | null>(null)
  const anchorRef = props.triggerRef ?? fallbackAnchorRef
  const [ready, setReady] = useState(LoadedSurface != null)

  const bindItems = (source: LazyDropdownMenuItem[]): LazyDropdownMenuItem[] =>
    source.map((item) => ({
      ...item,
      onSelect: item.children ? undefined : item.onSelect,
      children: item.children ? bindItems(item.children) : undefined,
    }))

  const items = bindItems(props.items ?? [])
  const groups = props.groups?.map((group) => ({
    ...group,
    items: bindItems(group.items),
  }))

  useEffect(() => {
    void dropdownMenuModule.then(() => setReady(true))
  }, [])

  if (!ready || LoadedSurface == null) {
    // Fenêtre de quelques ms pendant le chargement du chunk Base UI : le
    // clic est quand même enregistré (open passe à true) et le menu s'ouvre
    // dès que la surface est prête — plus de moteur d'overlay maison.
    const triggerProps = props.trigger.props as { onClick?: MouseEventHandler<HTMLButtonElement> }
    return cloneElement(props.trigger as ReactElement<any>, {
      ref: anchorRef,
      onClick: (event: MouseEvent<HTMLButtonElement>) => {
        triggerProps.onClick?.(event)
        if (!event.defaultPrevented) props.onOpenChange(!props.open)
      },
    })
  }

  const Surface = LoadedSurface
  return <Surface {...props} items={items} groups={groups} triggerRef={anchorRef} />
}
