import { forwardRef, type ComponentProps } from "react";
import { PopoverContent } from "../shadcn/popover";
import { cn } from "../../lib/utils";
import { RowButton } from "./RowButton";

/** Shared menu skin for mixed action/form panels, with Base UI positioning,
 * dismissal and focus management. Regular action menus use DropdownMenuSurface. */
export function MenuPanelContent({ className, ...props }: ComponentProps<typeof PopoverContent>) {
  return <PopoverContent {...props} plain className={cn("ui-menu-surface", className)} />;
}

export const MenuPanelItem = forwardRef<HTMLButtonElement, ComponentProps<typeof RowButton>>(
  function MenuPanelItem({ className, ...props }, ref) {
    return <RowButton {...props} ref={ref} className={cn("ui-menu-item", className)} />;
  },
);
