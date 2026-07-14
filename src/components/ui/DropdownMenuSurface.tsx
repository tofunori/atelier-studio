import { Fragment, type ReactElement, type ReactNode, type Ref } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../shadcn/dropdown-menu"

export type DropdownMenuSurfaceItem = {
  key: string
  label: ReactNode
  onSelect: () => void
  destructive?: boolean
  separatorBefore?: boolean
  className?: string
}

export function DropdownMenuSurface(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactElement
  triggerRef?: Ref<HTMLButtonElement>
  label?: string
  header?: ReactNode
  align?: "start" | "center" | "end"
  className?: string
  items: DropdownMenuSurfaceItem[]
}) {
  return (
    <DropdownMenu open={props.open} onOpenChange={props.onOpenChange}>
      <DropdownMenuTrigger ref={props.triggerRef} render={props.trigger} />
      <DropdownMenuContent
        align={props.align}
        sideOffset={4}
        aria-label={props.label}
        className={props.className}
      >
        {props.header && <DropdownMenuLabel>{props.header}</DropdownMenuLabel>}
        <DropdownMenuGroup>
          {props.items.map((item) => (
            <Fragment key={item.key}>
              {item.separatorBefore && <DropdownMenuSeparator />}
              <DropdownMenuItem
                variant={item.destructive ? "destructive" : "default"}
                className={item.className}
                onClick={item.onSelect}
              >
                {item.label}
              </DropdownMenuItem>
            </Fragment>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
