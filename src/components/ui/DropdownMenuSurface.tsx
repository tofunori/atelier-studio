import { Fragment, type ReactElement, type ReactNode, type Ref } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
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
  checked?: boolean
  /** Keep the menu open after invoking this action. */
  keepOpen?: boolean
  children?: DropdownMenuSurfaceItem[]
  destructive?: boolean
  disabled?: boolean
  separatorBefore?: boolean
  className?: string
}

/** A named group is optional; `items` remains the compact API for one group. */
export type DropdownMenuSurfaceGroup = {
  key: string
  label?: ReactNode
  items: DropdownMenuSurfaceItem[]
  separatorBefore?: boolean
}

export function DropdownMenuSurface(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactElement
  triggerRef?: Ref<HTMLButtonElement>
  label?: string
  header?: ReactNode
  /** Ligne de pied non cliquable — contexte, jamais une action. */
  footer?: ReactNode
  align?: "start" | "center" | "end"
  side?: "top" | "right" | "bottom" | "left"
  sideOffset?: number
  className?: string
  items?: DropdownMenuSurfaceItem[]
  /** Optional grouped form used by richer menus. */
  groups?: DropdownMenuSurfaceGroup[]
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
      ) : item.checked !== undefined ? (
        <DropdownMenuCheckboxItem checked={item.checked} closeOnClick={item.keepOpen === false}
          disabled={item.disabled} className={item.className} onCheckedChange={item.onSelect}>
          {item.label}
        </DropdownMenuCheckboxItem>
      ) : (
        <DropdownMenuItem
          variant={item.destructive ? "destructive" : "default"}
          closeOnClick={item.keepOpen !== true}
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
        side={props.side}
        sideOffset={props.sideOffset ?? 4}
        aria-label={props.label}
        className={props.className}
      >
        {props.header && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>{props.header}</DropdownMenuLabel>
          </DropdownMenuGroup>
        )}
        {props.groups?.length ? props.groups.map((group) => (
          <Fragment key={group.key}>
            {group.separatorBefore && <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              {group.label && <DropdownMenuLabel>{group.label}</DropdownMenuLabel>}
              {group.items.map(renderItem)}
            </DropdownMenuGroup>
          </Fragment>
        )) : (
          <DropdownMenuGroup>
            {(props.items ?? []).map(renderItem)}
          </DropdownMenuGroup>
        )}
        {props.footer && <div className="dropdown-surface-footer">{props.footer}</div>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
