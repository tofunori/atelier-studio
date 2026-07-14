import * as React from "react"
import { createRoot } from "react-dom/client"
import {
  Ellipsis,
  Filter,
  LayoutGrid,
  NotebookPen,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Star,
} from "lucide-react"

import { Button } from "@/components/shadcn/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shadcn/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/shadcn/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/shadcn/sheet"
import { ToggleGroup, ToggleGroupItem } from "@/components/shadcn/toggle-group"
import { Spinner } from "@/components/shadcn/spinner"
import { Tooltip, TooltipProvider } from "@/components/ui/Tooltip"

import "./styles.css"

type LegacyOption = { value: string; label: string }
type LegacyMenuItem = { key: string; label: string; active: boolean; element: HTMLElement }
type ConfirmRequest = { message: string; acceptLabel: string; resolve: (accepted: boolean) => void }

declare global {
  interface Window {
    __galleryConfirm?: (message: string, acceptLabel?: string) => Promise<boolean>
  }
}

const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null

function clickLegacy(id: string) {
  get<HTMLElement>(id)?.click()
}

function selectOptions(id: string): LegacyOption[] {
  const select = get<HTMLSelectElement>(id)
  return select ? [...select.options].map((option) => ({ value: option.value, label: option.text })) : []
}

function setSelect(id: string, value: string) {
  const select = get<HTMLSelectElement>(id)
  if (!select) return
  select.value = value
  select.dispatchEvent(new Event("change", { bubbles: true }))
}

function legacyItems(menuId: string, selector: string): LegacyMenuItem[] {
  return [...document.querySelectorAll<HTMLElement>(`#${menuId} ${selector}`)].map((element, index) => ({
    key: element.dataset.pick ?? element.dataset.wfpick ?? element.dataset.rec ?? element.dataset.cat ?? element.dataset.fmt ?? String(index),
    label: (element instanceof HTMLInputElement ? element.closest("label")?.textContent : element.textContent)
      ?.replace(/\s+/g, " ").trim() || "Option",
    active: (element instanceof HTMLInputElement && element.checked)
      || element.classList.contains("on")
      || element.closest(".mi")?.classList.contains("on") === true,
    element,
  }))
}

function LegacySubmenu({ label, items }: { label: string; items: LegacyMenuItem[] }) {
  if (!items.length) return null
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger data-gallery-filter-group={label.toLowerCase()}>{label}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuGroup>
          {items.map((item) => (
            <DropdownMenuCheckboxItem
              key={`${label}-${item.key}`}
              checked={item.active}
              data-gallery-filter-item={item.key}
              onClick={() => item.element.click()}
            >
              {item.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function GalleryToolbar() {
  const [, refresh] = React.useReducer((value) => value + 1, 0)
  const search = get<HTMLInputElement>("q")?.value ?? ""
  const sort = get<HTMLSelectElement>("sort")
  const folder = get<HTMLSelectElement>("folder")
  const favorite = get<HTMLElement>("favChip")
  const rescanning = get<HTMLElement>("rescan")?.classList.contains("spinning") === true
  const density = get<HTMLElement>("densitySeg")?.querySelector<HTMLElement>("button.on")?.dataset.d ?? "m"
  const formatItems = legacyItems("fmtMenu", "[data-cat]")
  const fileTypeItems = legacyItems("fmtMenu", "input[data-fmt]")
  const collectionItems = legacyItems("collMenu", "[data-pick]")
  const workflowItems = legacyItems("wfMenu", "[data-wfpick]")
  const recentItems = legacyItems("recMenu", "[data-rec]")
  const activeFilterCount = document.querySelectorAll("#activeChips [data-fx]").length
  const favoriteActive = favorite?.classList.contains("on") === true

  React.useEffect(() => {
    const update = () => refresh()
    const observer = new MutationObserver(update)
    const observed = [
      get<HTMLElement>("activeChips"),
      get<HTMLElement>("densitySeg"),
      get<HTMLElement>("favChip"),
      get<HTMLElement>("rescan"),
      get<HTMLElement>("fmtMenu"),
      get<HTMLElement>("collMenu"),
      get<HTMLElement>("wfMenu"),
      get<HTMLElement>("recMenu"),
    ].filter((element): element is HTMLElement => Boolean(element))
    observed.forEach((element) => observer.observe(element, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    }))
    const legacyInputs = [get<HTMLInputElement>("q"), get<HTMLSelectElement>("sort"), get<HTMLSelectElement>("folder")]
      .filter((element): element is HTMLInputElement | HTMLSelectElement => Boolean(element))
    legacyInputs.forEach((element) => {
      element.addEventListener("input", update)
      element.addEventListener("change", update)
    })
    document.documentElement.classList.add("gallery-react-mounted")
    document.documentElement.dataset.galleryUi = "shadcn-react-v1"
    return () => {
      observer.disconnect()
      legacyInputs.forEach((element) => {
        element.removeEventListener("input", update)
        element.removeEventListener("change", update)
      })
      document.documentElement.classList.remove("gallery-react-mounted")
    }
  }, [])

  const updateSearch = (value: string) => {
    const input = get<HTMLInputElement>("q")
    if (!input) return
    input.value = value
    input.dispatchEvent(new Event("input", { bubbles: true }))
  }

  return (
    <div className="gallery-command-bar" role="toolbar" aria-label="Gallery commands">
      <InputGroup className="gallery-command-search" data-gallery-command-group="search">
        <InputGroupInput
          aria-label="Search project files"
          data-gallery-command="search"
          placeholder="Search by name or folder…"
          value={search}
          onChange={(event) => updateSearch(event.target.value)}
        />
        <InputGroupAddon align="inline-start" aria-hidden="true">
          <Search />
        </InputGroupAddon>
      </InputGroup>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          render={
            <Button variant={activeFilterCount ? "secondary" : "outline"} size="sm">
              <Filter data-icon="inline-start" />
              <span data-gallery-command="filters">Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}</span>
            </Button>
          }
        />
        <DropdownMenuContent className="tw:w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Filter gallery</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={favorite?.classList.contains("on") === true} onClick={() => clickLegacy("favChip")}>
              <Star data-icon="inline-start" /> Favorites
            </DropdownMenuCheckboxItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-gallery-filter-group="folders">Folders</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuGroup>
                  {selectOptions("folder").map((option) => (
                    <DropdownMenuCheckboxItem
                      key={option.value || "all"}
                      checked={(folder?.value ?? "") === option.value}
                      data-gallery-filter-item={option.value || "all"}
                      onClick={() => setSelect("folder", option.value)}
                    >
                      {option.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <LegacySubmenu label="Formats" items={formatItems} />
            <LegacySubmenu label="File types" items={fileTypeItems} />
            <LegacySubmenu label="Collections" items={collectionItems} />
            <LegacySubmenu label="Status" items={workflowItems} />
            <LegacySubmenu label="Recent" items={recentItems} />
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => clickLegacy("filtersClear")}>
              <RotateCcw data-icon="inline-start" /> Clear all filters
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant={favoriteActive ? "secondary" : "outline"}
        size="sm"
        data-gallery-command="favorites"
        aria-pressed={favoriteActive}
        onClick={() => clickLegacy("favChip")}
      >
        <Star data-icon="inline-start" />
        Favorites
      </Button>

      <Select modal={false} value={sort?.value ?? "mtime"} onValueChange={(value) => value && setSelect("sort", value)}>
        <SelectTrigger size="sm" className="gallery-command-select gallery-command-sort" aria-label="Sort project files">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {selectOptions("sort").map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <ToggleGroup
        value={[density]}
        onValueChange={(values) => {
          const next = values.at(-1)
          if (next) get<HTMLElement>("densitySeg")?.querySelector<HTMLElement>(`[data-d="${next}"]`)?.click()
        }}
        className="gallery-command-density"
        aria-label="Card density"
      >
        <ToggleGroupItem value="s" size="sm" aria-label="Compact cards">S</ToggleGroupItem>
        <ToggleGroupItem value="m" size="sm" aria-label="Medium cards">M</ToggleGroupItem>
        <ToggleGroupItem value="l" size="sm" aria-label="Large cards">L</ToggleGroupItem>
      </ToggleGroup>

      <Button
        variant="outline"
        size="sm"
        data-gallery-command="rescan"
        aria-busy={rescanning}
        disabled={rescanning}
        onClick={() => clickLegacy("rescan")}
      >
        {rescanning
          ? <Spinner data-icon="inline-start" />
          : <RefreshCw data-icon="inline-start" />}
        <span className="gallery-command-rescan-label">Rescan</span>
      </Button>

      <DropdownMenu modal={false}>
        <Tooltip label="Gallery tools">
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Gallery tools"><Ellipsis /></Button>} />
        </Tooltip>
        <DropdownMenuContent align="end" className="tw:w-48">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => clickLegacy("viewChip")}><Settings data-icon="inline-start" /> Gallery settings…</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => clickLegacy("boardChip")}><LayoutGrid data-icon="inline-start" /> Board</DropdownMenuItem>
            <DropdownMenuItem onClick={() => clickLegacy("notesChip")}><NotebookPen data-icon="inline-start" /> Notes</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function GalleryConfirmDialog() {
  const [request, setRequest] = React.useState<ConfirmRequest | null>(null)
  const requestRef = React.useRef<ConfirmRequest | null>(null)

  const settle = React.useCallback((accepted: boolean) => {
    const current = requestRef.current
    if (!current) return
    requestRef.current = null
    setRequest(null)
    current.resolve(accepted)
  }, [])

  React.useEffect(() => {
    window.__galleryConfirm = (message, acceptLabel = "Delete") =>
      new Promise<boolean>((resolve) => {
        if (requestRef.current) requestRef.current.resolve(false)
        const next = { message, acceptLabel, resolve }
        requestRef.current = next
        setRequest(next)
      })
    return () => {
      delete window.__galleryConfirm
      if (requestRef.current) requestRef.current.resolve(false)
      requestRef.current = null
    }
  }, [])

  return (
    <AlertDialog open={Boolean(request)} onOpenChange={(nextOpen) => { if (!nextOpen) settle(false) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm action</AlertDialogTitle>
          <AlertDialogDescription>{request?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            data-gallery-confirm="accept"
            onClick={() => settle(true)}
          >
            {request?.acceptLabel || "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function GalleryInspector() {
  const [open, setOpen] = React.useState(document.body.classList.contains("has-insp"))
  const [modal, setModal] = React.useState(() => window.matchMedia("(max-width: 800px)").matches)
  const [title, setTitle] = React.useState(get<HTMLElement>("inspTitle")?.textContent || "Inspector")
  const legacyInspectorRef = React.useRef(get<HTMLElement>("inspector"))

  const attachLegacyBody = React.useCallback((host: HTMLDivElement | null) => {
    const legacyBody = get<HTMLElement>("inspBody")
    if (legacyBody && host) host.appendChild(legacyBody)
  }, [])

  React.useLayoutEffect(() => {
    return () => {
      const legacyBody = get<HTMLElement>("inspBody")
      if (legacyBody && legacyInspectorRef.current) legacyInspectorRef.current.appendChild(legacyBody)
    }
  }, [])

  React.useEffect(() => {
    const sync = () => {
      const embedded = document.documentElement.classList.contains("emb")
      setOpen(!embedded && document.body.classList.contains("has-insp"))
      setTitle(get<HTMLElement>("inspTitle")?.textContent || "Inspector")
    }
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] })
    const legacyTitle = get<HTMLElement>("inspTitle")
    if (legacyTitle) observer.observe(legacyTitle, { childList: true, characterData: true, subtree: true })
    sync()
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)")
    const sync = () => setModal(media.matches)
    media.addEventListener("change", sync)
    sync()
    return () => media.removeEventListener("change", sync)
  }, [])

  return (
    <Sheet
      modal={modal}
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (!nextOpen && details.reason === "escape-key") {
          details.cancel()
          details.allowPropagation()
          return
        }
        if (!nextOpen && document.body.classList.contains("has-insp")) clickLegacy("inspClose")
      }}
    >
      <SheetContent
        side="right"
        layer={modal ? "modal" : "panel"}
        keepMounted
        showOverlay={modal}
        className="tw:gap-0 tw:p-0"
        style={{ width: "300px", maxWidth: "calc(100vw - 16px)" }}
      >
        <SheetHeader className="tw:border-b tw:border-border tw:pr-12">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="tw:sr-only">File metadata and gallery actions</SheetDescription>
        </SheetHeader>
        <div ref={attachLegacyBody} className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col" />
      </SheetContent>
    </Sheet>
  )
}

const mount = document.getElementById("gallery-react-toolbar")
if (mount) {
  createRoot(mount).render(
    <TooltipProvider>
      <GalleryToolbar />
      <GalleryConfirmDialog />
      <GalleryInspector />
    </TooltipProvider>,
  )
}
