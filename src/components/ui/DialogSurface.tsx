import { useRef, type ReactNode } from "react"
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
  /** À l'ouverture, le focus va à la surface elle-même plutôt qu'au premier
   *  contrôle : pour une fenêtre qui s'ouvre toute seule, aucun bouton ne
   *  porte d'anneau que personne n'a visé. Tab entre ensuite dans le contenu. */
  focusSurface?: boolean
  children: ReactNode
}) {
  const surface = useRef<HTMLDivElement>(null)
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        ref={surface}
        className={props.className}
        closeLabel={props.closeLabel}
        initialFocus={props.focusSurface ? surface : undefined}
      >
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
