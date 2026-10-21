import { cn } from "@/lib/utils"
import { Spinner as AtelierSpinner, type SpinnerProps } from "@/components/ui/Spinner"

// Le Spinner du registre rend l'arc unique d'Atelier (ui/Spinner, A11) : même
// tracé, même tempo --motion-spin, même neutralisation reduced-motion.
function Spinner({ className, ...props }: SpinnerProps) {
  return <AtelierSpinner className={cn("tw:size-4", className)} {...props} />
}

export { Spinner }
