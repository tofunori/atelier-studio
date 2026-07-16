import {
  cloneElement,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type MouseEvent,
  type MouseEventHandler,
  type ReactNode,
  type RefObject,
} from "react"

const dropdownMenuModule = import("./DropdownMenuSurface")
const DropdownMenuSurface = lazy(async () => {
  const module = await dropdownMenuModule
  return { default: module.DropdownMenuSurface }
})

export type LazyDropdownMenuItem = {
  key: string
  label: ReactNode
  onSelect: () => void
  destructive?: boolean
  separatorBefore?: boolean
  className?: string
  /** Keep the controlled menu open when the action changes its item set. */
  keepOpen?: boolean
}

export function LazyDropdownMenu(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactElement
  triggerRef?: RefObject<HTMLButtonElement | null>
  label?: string
  align?: "start" | "center" | "end"
  className?: string
  header?: ReactNode
  items: LazyDropdownMenuItem[]
}) {
  const fallbackAnchorRef = useRef<HTMLButtonElement | null>(null)
  const anchorRef = props.triggerRef ?? fallbackAnchorRef
  const [ready, setReady] = useState(false)
  const keepOpenRef = useRef(false)

  const onOpenChange = (open: boolean) => {
    if (!open && keepOpenRef.current) {
      keepOpenRef.current = false
      return
    }
    props.onOpenChange(open)
  }

  const invoke = (item: LazyDropdownMenuItem) => {
    if (item.keepOpen) keepOpenRef.current = true
    item.onSelect()
  }

  const items = props.items.map((item) => ({
    ...item,
    onSelect: () => invoke(item),
  }))

  useEffect(() => {
    void dropdownMenuModule.then(() => setReady(true))
  }, [])

  if (!ready) {
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

  return (
    <Suspense fallback={props.trigger}>
      <DropdownMenuSurface {...props} items={items} onOpenChange={onOpenChange} triggerRef={anchorRef} />
    </Suspense>
  )
}
