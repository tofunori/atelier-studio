import type { ReactNode } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../shadcn/dialog"

export function DialogSurface(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  closeLabel?: string
  className?: string
  children: ReactNode
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className={props.className} closeLabel={props.closeLabel}>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          {props.description != null && (
            <DialogDescription>{props.description}</DialogDescription>
          )}
        </DialogHeader>
        {props.children}
      </DialogContent>
    </Dialog>
  )
}
