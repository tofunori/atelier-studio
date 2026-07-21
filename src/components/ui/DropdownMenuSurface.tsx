import { Fragment, type ReactElement, type ReactNode, type Ref } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../shadcn/dropdown-menu"

export type DropdownMenuSurfaceItem = {
  key: string
  label: ReactNode
  onSelect?: () => void
  children?: DropdownMenuSurfaceItem[]
  destructive?: boolean
  disabled?: boolean
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
  const renderItem = (item: DropdownMenuSurfaceItem) => (
    <Fragment key={item.key}>
      {item.separatorBefore && <DropdownMenuSeparator />}
      {item.children?.length ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={item.disabled} className={item.className}>
            {item.label}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuGroup>
              {item.children.map(renderItem)}
            </DropdownMenuGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : (
        <DropdownMenuItem
          variant={item.destructive ? "destructive" : "default"}
          disabled={item.disabled}
          className={item.className}
          onClick={item.onSelect}
        >
          {item.label}
        </DropdownMenuItem>
      )}
    </Fragment>
  )

  return (
    <DropdownMenu open={props.open} onOpenChange={props.onOpenChange}>
      <DropdownMenuTrigger ref={props.triggerRef} render={props.trigger} />
      <DropdownMenuContent
        align={props.align}
        sideOffset={4}
        aria-label={props.label}
        className={props.className}
      >
        <DropdownMenuGroup>
          {props.header && <DropdownMenuLabel>{props.header}</DropdownMenuLabel>}
          {props.items.map(renderItem)}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
