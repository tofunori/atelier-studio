import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
import { useSyncExternalStore } from "react"
import { CloseIcon } from "@/components/ui/CloseButton"
import "@/styles/toasts.css"

// Le thème des toasts suit celui de l'APP (data-theme sur <html>), pas le
// mode de macOS : sinon un Atelier sombre sur un Mac clair montrait des
// toasts clairs et une croix presque invisible (PRIM-09).
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
  return () => observer.disconnect()
}
const appTheme = (): "dark" | "light" =>
  document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"

const Toaster = ({ theme, ...props }: ToasterProps) => {
  const current = useSyncExternalStore(subscribeTheme, appTheme, () => "dark" as const)
  return (
    <Sonner
      theme={theme ?? current}
      className="tw:toaster tw:group"
      icons={{
        success: (
          <CircleCheckIcon className="tw:size-4" />
        ),
        info: (
          <InfoIcon className="tw:size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="tw:size-4" />
        ),
        error: (
          <OctagonXIcon className="tw:size-4" />
        ),
        loading: (
          <Loader2Icon className="tw:size-4 tw:animate-spin" />
        ),
        // la même croix que partout (CloseButton, PRIM-11)
        close: <CloseIcon size={12} />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "transparent",
          "--border-radius": "var(--radius-surface)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
