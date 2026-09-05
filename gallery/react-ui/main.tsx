import { GalleryViewSwitch, GalleryPresentation } from "./GalleryPresentation"
import { ProjectFolderMenu, type FolderMenuState } from "../../src/components/ProjectFolderMenu"
import * as React from "react"
import { createRoot } from "react-dom/client"
import {
  ArrowDownUp,
  CheckSquare2,
  ChevronDown,
  Ellipsis,
  Filter,
  LayoutGrid,
  NotebookPen,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Star,
  Trash2,
  X,
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
  AlertDialogMedia,
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
  InputGroupButton,
  InputGroupInput,
} from "@/components/shadcn/input-group"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/shadcn/popover"
import { Switch } from "@/components/shadcn/switch"
import { Separator } from "@/components/shadcn/separator"
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
type GalleryFileType = { key: string; label: string; active: boolean; pinned: boolean }
type GalleryFileTypePreset = { id: string; label: string; extensions: string[]; custom: boolean; active: boolean }
type GalleryFileTypeState = {
  projectName: string
  types: GalleryFileType[]
  pinned: string[]
  presets: GalleryFileTypePreset[]
  summary: string
}
type GalleryFileTypeAdapter = {
  getState: () => GalleryFileTypeState
  setActive: (extensions: string[]) => void
  setPinned: (extensions: string[]) => void
  applyPreset: (id: string) => void
  savePreset: (name: string) => void
  removePreset: (id: string) => void
  resetFilters: () => void
}
type GallerySelectionState = { rels: string[]; imageCount: number }
type GallerySelectionAdapter = {
  getState: () => GallerySelectionState
  open: () => void
  compare: () => void
  collect: (anchor: HTMLElement) => void
  export: (anchor: HTMLElement) => void
  hide: () => void
  delete: () => void
  clear: () => void
}
type ConfirmRequest = { message: string; acceptLabel: string; resolve: (accepted: boolean) => void }
type ConfirmPresentation = {
  title: string
  description?: string
  acceptLabel: string
  destructive?: boolean
}

declare global {
  interface Window {
    __galleryConfirm?: (message: string, acceptLabel?: string) => Promise<boolean>
    __galleryFileTypes?: GalleryFileTypeAdapter
    __gallerySelection?: GallerySelectionAdapter
  }
}

const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null

function EmbeddedProjectFolderMenu() {
  const [state, setState] = React.useState<FolderMenuState | null>(null);
  const parentOrigin = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (window.parent === window) return;
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== "atelier-folder-state") return;
      if (parentOrigin.current !== null && event.origin !== parentOrigin.current) return;
      const next = event.data.state;
      if (!next || !Array.isArray(next.folders) || typeof next.selected !== "string" || typeof next.label !== "string" || typeof next.manageLabel !== "string" || !next.folders.every((f: {path?: unknown; name?: unknown}) => f && typeof f.path === "string" && typeof f.name === "string")) return;
      parentOrigin.current = event.origin;
      setState(next);
    };
    window.addEventListener("message", receive);
    window.parent.postMessage({ type: "atelier-folder-ready" }, "*");
    return () => window.removeEventListener("message", receive);
  }, []);
  if (!state) return null;
  const send = (message: object) => { if (parentOrigin.current) window.parent.postMessage(message, parentOrigin.current === "null" ? "*" : parentOrigin.current); };
  return <ProjectFolderMenu state={state} onSelect={path => send({ type: "atelier-folder-select", path })} onManage={() => send({ type: "atelier-folder-manage" })}/>;
}

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

function stripLegacyCount(label: string) {
  return label.replace(/\s+\d+$/, "").trim()
}

function GalleryFileTypePanel({ state, folder, collectionItems }: {
  state: GalleryFileTypeState; folder: HTMLSelectElement | null; collectionItems: LegacyMenuItem[]
}) {
  const [expanded, setExpanded] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [name, setName] = React.useState("")
  const adapter = window.__galleryFileTypes
  const active = state.types.filter(type => type.active).map(type => type.key)
  const statusNames: Record<string,string> = {"":"Tous",draft:"Brouillon",candidate:"Candidat",final:"Final",rejected:"Rejeté"}
  const workflow = legacyItems("wfMenu", "[data-wfpick]").map(item => ({...item,label:statusNames[item.key] ?? stripLegacyCount(item.label)}))
  const folders = selectOptions("folder")
  const preset = state.presets.find(item => item.active && item.custom) ?? state.presets.find(item => item.active)
  const save = () => { if (name.trim()) { adapter?.savePreset(name.trim()); setSaving(false); setName("") } }
  return <>
    <PopoverHeader className="gallery-filter-panel-head">
      <PopoverTitle>Filtres</PopoverTitle>
      <Button variant="ghost" size="xs" onClick={() => adapter?.resetFilters()}>Réinitialiser</Button>
    </PopoverHeader>
    <PopoverDescription className="tw:sr-only">Formats, collections et statut des fichiers</PopoverDescription>
    <div className="gallery-filter-scroll gallery-compact-filters" data-gallery-file-type-panel>
      <div className="gallery-filter-field"><span>Vue enregistrée</span>
        <Select modal={false} value={preset?.id ?? "custom"} onValueChange={value => { if(typeof value === "string" && value !== "custom") adapter?.applyPreset(value) }}>
          <SelectTrigger size="sm" aria-label="Vue enregistrée"><SelectValue>{preset?.label || "Personnalisée"}</SelectValue></SelectTrigger>
          <SelectContent className="gallery-filter-select" align="end" alignItemWithTrigger={false} sideOffset={5}><SelectGroup><SelectItem value="custom">Personnalisée</SelectItem>{state.presets.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </div>
      <div className="gallery-format-heading"><span>Formats</span><Button variant="ghost" size="xs" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Moins" : "Plus…"}</Button></div>
      <ToggleGroup multiple value={active} onValueChange={values => {
        const shown = state.types.filter(type => expanded || state.pinned.includes(type.key)).map(type => type.key)
        adapter?.setActive([...active.filter(key => !shown.includes(key)), ...values.filter(key => shown.includes(key))])
      }} className="gallery-format-chips" aria-label="Formats de fichiers">
        {state.types.filter(type => (expanded || state.pinned.includes(type.key)) && (!query || type.label.toLowerCase().includes(query.toLowerCase()))).map(type =>
          <ToggleGroupItem key={type.key} value={type.key} size="sm" data-gallery-quick-type={type.key} data-gallery-file-type={type.key}>{type.label}</ToggleGroupItem>)}
      </ToggleGroup>
      {expanded && <><InputGroup><InputGroupInput aria-label="Rechercher un format" placeholder="Rechercher un format…" value={query} onChange={e => setQuery(e.target.value)}/></InputGroup>
        <details className="gallery-pin-types"><summary>Formats épinglés</summary><ToggleGroup multiple value={state.pinned} onValueChange={values => adapter?.setPinned(values)} className="gallery-format-chips" aria-label="Formats épinglés">{state.types.map(type => <ToggleGroupItem key={type.key} value={type.key} size="xs"><Star/>{type.label}</ToggleGroupItem>)}</ToggleGroup></details></>}
      <div className="gallery-filter-field"><span>Favoris seulement</span><Switch aria-label="Favoris seulement" checked={get("favChip")?.classList.contains("on") === true} onCheckedChange={() => clickLegacy("favChip")}/></div>
      <div className="gallery-filter-field"><span>Statut</span><Select modal={false} value={workflow.find(item => item.active)?.key || ""} onValueChange={value => workflow.find(item => item.key === value)?.element.click()}><SelectTrigger size="sm" aria-label="Filtrer par statut"><SelectValue>{workflow.find(item => item.active)?.label || "Tous"}</SelectValue></SelectTrigger><SelectContent className="gallery-filter-select" align="end" alignItemWithTrigger={false} sideOffset={5}><SelectGroup>{workflow.map(item => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
      <div className="gallery-filter-field"><span>Collection</span><Select modal={false} value={collectionItems.find(item => item.active)?.key || ""} onValueChange={value => { if(!value) get("collMenu")?.querySelector<HTMLElement>("[data-clear]")?.click(); else collectionItems.find(item => item.key === value)?.element.click() }}><SelectTrigger size="sm" aria-label="Filtrer par collection"><SelectValue>{stripLegacyCount(collectionItems.find(item => item.active)?.label || "Toutes")}</SelectValue></SelectTrigger><SelectContent className="gallery-filter-select" align="end" alignItemWithTrigger={false} sideOffset={5}><SelectGroup><SelectItem value="">Toutes</SelectItem>{collectionItems.map(item => <SelectItem key={item.key} value={item.key}>{stripLegacyCount(item.label)}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
      {folders.length > 1 && <div className="gallery-filter-field"><span>Sous-dossier</span><Select modal={false} value={folder?.value || ""} onValueChange={value => setSelect("folder", typeof value === "string" ? value : "")}><SelectTrigger size="sm" aria-label="Filtrer par sous-dossier"><SelectValue>{folder?.value || "Tous"}</SelectValue></SelectTrigger><SelectContent className="gallery-filter-select" align="end" alignItemWithTrigger={false} sideOffset={5}><SelectGroup>{folders.map(item => <SelectItem key={item.value} value={item.value}>{item.value ? item.label : "Tous"}</SelectItem>)}</SelectGroup></SelectContent></Select></div>}
      <Separator/>
      {saving ? <InputGroup><InputGroupInput aria-label="Nom de la vue" placeholder="Nom de la vue…" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if(e.key === "Enter") save(); if(e.key === "Escape") {e.stopPropagation();setSaving(false)} }} autoFocus/><InputGroupAddon align="inline-end"><InputGroupButton disabled={!name.trim()} onClick={save}>Enregistrer</InputGroupButton></InputGroupAddon></InputGroup> : <Button variant="ghost" size="sm" className="tw:justify-start" data-gallery-new-preset onClick={() => setSaving(true)}><Plus/>Enregistrer cette vue…</Button>}
      {preset?.custom && <Button variant="ghost" size="xs" onClick={() => adapter?.removePreset(preset.id)}><Trash2/>Supprimer cette vue</Button>}
    </div>
  </>
}

function presentConfirmation(request: ConfirmRequest): ConfirmPresentation {
  const singleTrash = request.message.match(/^Move to Trash\?\s+(.+)$/)
  if (singleTrash) {
    const path = singleTrash[1]
    const parts = path.split("/")
    const fileName = parts.pop() || path
    const folder = parts.join("/")
    return {
      title: `Move “${fileName}” to Trash?`,
      description: folder
        ? `This removes it from ${folder}. You can recover it from Trash.`
        : "This removes it from the project. You can recover it from Trash.",
      acceptLabel: "Move to Trash",
      destructive: true,
    }
  }

  const bulkTrash = request.message.match(/^(\d+) file\(s\) → trash\?$/)
  if (bulkTrash) {
    const count = Number(bulkTrash[1])
    return {
      title: `Move ${count} ${count === 1 ? "file" : "files"} to Trash?`,
      description: `${count === 1 ? "This file" : "These files"} will be removed from the project. You can recover ${count === 1 ? "it" : "them"} from Trash.`,
      acceptLabel: "Move to Trash",
      destructive: true,
    }
  }

  return {
    title: request.message,
    acceptLabel: request.acceptLabel,
    destructive: ["Delete", "Discard", "Supprimer"].includes(request.acceptLabel),
  }
}

function GalleryToolbar() {
  const [, refresh] = React.useReducer((value) => value + 1, 0)
  const nestedEscapeRef = React.useRef(false)
  const filterTriggerRef = React.useRef<HTMLButtonElement>(null)
  const selectionMoreRef = React.useRef<HTMLButtonElement>(null)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [filtersOpen, setFiltersOpen] = React.useState(false)
  const search = get<HTMLInputElement>("q")?.value ?? ""
  const sort = get<HTMLSelectElement>("sort")
  const folder = get<HTMLSelectElement>("folder")
  const favorite = get<HTMLElement>("favChip")
  const rescanning = get<HTMLElement>("rescan")?.classList.contains("spinning") === true
  const collectionItems = legacyItems("collMenu", "[data-pick]")
  const recentItems = legacyItems("recMenu", "[data-rec]")
  const fileTypeState = window.__galleryFileTypes?.getState() ?? {
    projectName: "this project",
    types: legacyItems("fmtMenu", "input[data-fmt]").map((item) => ({
      key: item.key, label: stripLegacyCount(item.label), active: item.active, pinned: false,
    })),
    pinned: [], presets: [], summary: "File types",
  }
  const selection = window.__gallerySelection?.getState() ?? { rels: [], imageCount: 0 }
  const activeFilterCount = document.querySelectorAll("#activeChips [data-fx]").length
  const favoriteActive = favorite?.classList.contains("on") === true
  const currentSort = sort?.value ?? "mtime"
  const sortKey = currentSort.replace(/_(asc|desc)$/, "")
  const sortDescending = currentSort.endsWith("_desc") || (["size", "mtime", "btime", "rating"].includes(sortKey) && !currentSort.endsWith("_asc"))
  const setSort = (key: string, descending: boolean) => setSelect("sort", ["size", "mtime", "btime", "rating"].includes(key) ? key + (descending ? "" : "_asc") : key + (descending ? "_desc" : ""))
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
      get<HTMLElement>("selBar"),
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
    window.addEventListener("atelier-gallery-file-types-change", update)
    window.addEventListener("atelier-gallery-selection-change", update)
    document.documentElement.classList.add("gallery-react-mounted")
    document.documentElement.dataset.galleryUi = "shadcn-react-v1"
    return () => {
      observer.disconnect()
      legacyInputs.forEach((element) => {
        element.removeEventListener("input", update)
        element.removeEventListener("change", update)
      })
      window.removeEventListener("atelier-gallery-file-types-change", update)
      window.removeEventListener("atelier-gallery-selection-change", update)
      document.documentElement.classList.remove("gallery-react-mounted")
    }
  }, [])

  React.useEffect(() => {
    if (selection.rels.length) {
      setSearchOpen(false)
      setFiltersOpen(false)
    }
  }, [selection.rels.length])


  React.useEffect(() => {
    if (!filtersOpen) return
    const closeFiltersOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") { nestedEscapeRef.current = false; return }
      if ([...document.querySelectorAll<HTMLElement>('[role="menu"], [role="listbox"]:not(#grid)')].some(el => el.getClientRects().length > 0)) {
        nestedEscapeRef.current = true
        return
      }
      nestedEscapeRef.current = false
      event.preventDefault()
      event.stopPropagation()
      setFiltersOpen(false)
      requestAnimationFrame(() => filterTriggerRef.current?.focus())
    }
    window.addEventListener("keydown", closeFiltersOnEscape, true)
    return () => window.removeEventListener("keydown", closeFiltersOnEscape, true)
  }, [filtersOpen])

  React.useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isEditable = target?.matches("input, textarea, select") || target?.isContentEditable
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || isEditable) return
      event.preventDefault()
      setFiltersOpen(false)
      setSearchOpen(true)
    }
    document.addEventListener("keydown", openSearch)
    return () => document.removeEventListener("keydown", openSearch)
  }, [])

  const updateSearch = (value: string) => {
    const input = get<HTMLInputElement>("q")
    if (!input) return
    input.value = value
    input.dispatchEvent(new Event("input", { bubbles: true }))
  }

  if (selection.rels.length) {
    const selectionAdapter = window.__gallerySelection
    return (
      <div className="gallery-command-bar gallery-selection-command-bar" role="toolbar" aria-label="Selected files actions" data-gallery-toolbar-state="selection">
        <EmbeddedProjectFolderMenu />
        <div className="gallery-selection-count" aria-live="polite">
          <CheckSquare2 aria-hidden="true" />
          <span>{selection.rels.length}<span className="gallery-selection-word"> selected</span></span>
        </div>
        <div className="gallery-command-spacer" />
        <GalleryViewSwitch/>
        {selection.rels.length === 1 && (
          <Button className="gallery-selection-inline" variant="outline" size="sm" data-gallery-selection-action="open" onClick={() => selectionAdapter?.open()}>Open</Button>
        )}
        {selection.imageCount >= 2 && (
          <Button className="gallery-selection-inline" variant="outline" size="sm" data-gallery-selection-action="compare" onClick={() => selectionAdapter?.compare()}>Compare</Button>
        )}
        <Button className="gallery-selection-inline" variant="outline" size="sm" data-gallery-selection-action="collect" onClick={(event) => { event.stopPropagation(); selectionAdapter?.collect(event.currentTarget) }}>Collect</Button>
        <Button className="gallery-selection-inline" variant="outline" size="sm" data-gallery-selection-action="export" onClick={(event) => { event.stopPropagation(); selectionAdapter?.export(event.currentTarget) }}>
          Export <ChevronDown data-icon="inline-end" />
        </Button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger render={<Button ref={selectionMoreRef} variant="ghost" size="icon-sm" aria-label="More selection actions"><Ellipsis /></Button>} />
          <DropdownMenuContent align="end" className="tw:w-48">
            {/* Repli étroit : les mêmes actions que les boutons, affichées
                seulement quand la barre n'a plus la place de les porter (CSS).
                Elles s'ancrent sur le déclencheur ⋯ — pas sur l'item de menu,
                qui disparaît avec le menu avant que la position soit lue. */}
            <DropdownMenuGroup className="gallery-selection-overflow">
              {selection.rels.length === 1 && (
                <DropdownMenuItem onClick={() => selectionAdapter?.open()}>Open</DropdownMenuItem>
              )}
              {selection.imageCount >= 2 && (
                <DropdownMenuItem onClick={() => selectionAdapter?.compare()}>Compare</DropdownMenuItem>
              )}
              {/* stopPropagation comme sur les boutons de la barre : le clic
                  remonte sinon jusqu'au listener global de la galerie, qui
                  referme aussitôt le menu hérité qu'on vient d'ouvrir. */}
              <DropdownMenuItem onClick={(event) => { event.stopPropagation(); selectionMoreRef.current && selectionAdapter?.collect(selectionMoreRef.current) }}>Collect</DropdownMenuItem>
              <DropdownMenuItem onClick={(event) => { event.stopPropagation(); selectionMoreRef.current && selectionAdapter?.export(selectionMoreRef.current) }}>Export</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="gallery-selection-overflow" />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => selectionAdapter?.hide()}>Hide selected</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onClick={() => selectionAdapter?.delete()}>
                <Trash2 data-icon="inline-start" /> Move to Trash
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip label="Clear selection (Esc)">
          <Button variant="ghost" size="icon-sm" aria-label="Clear selection" data-gallery-selection-action="clear" onClick={() => selectionAdapter?.clear()}>
            <X />
          </Button>
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="gallery-command-bar" role="toolbar" aria-label="Gallery commands" data-gallery-toolbar-state="normal">
      <EmbeddedProjectFolderMenu />
      <div className="gallery-command-group" data-gallery-group="filter" role="group" aria-label="Search and filter gallery">
      <Popover open={searchOpen} onOpenChange={(open) => {
        setSearchOpen(open)
        if (open) setFiltersOpen(false)
      }}>
        <Tooltip label={search ? "Modifier la recherche" : "Rechercher (/)"}>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                data-gallery-command="search-trigger"
                data-gallery-active={search ? "true" : undefined}
                aria-label={search ? `Rechercher: ${search}` : "Rechercher"}
                aria-pressed={searchOpen}
              >
                <Search />
              </Button>
            }
          />
        </Tooltip>
        <PopoverContent align="start" sideOffset={6} className="gallery-search-popover tw:gap-0 tw:p-2">
          <PopoverTitle className="tw:sr-only">Rechercher des fichiers</PopoverTitle>
          <PopoverDescription className="tw:sr-only">Search by file name or folder</PopoverDescription>
          <InputGroup data-gallery-command-group="search">
            <InputGroupInput
              aria-label="Rechercher des fichiers"
              data-gallery-command="search"
              placeholder="Nom ou dossier…"
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
              autoFocus
            />
            <InputGroupAddon align="inline-start" aria-hidden="true"><Search /></InputGroupAddon>
            {search && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="icon-xs" aria-label="Effacer la recherche" onClick={() => updateSearch("")}><X /></InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
        </PopoverContent>
      </Popover>

      <Tooltip label="Favoris"><Button variant="ghost" size="icon-sm" data-gallery-command="favorites" aria-label="Favoris" aria-pressed={favoriteActive} data-gallery-active={favoriteActive ? "true" : undefined} onClick={() => clickLegacy("favChip")}><Star fill={favoriteActive ? "currentColor" : "none"}/></Button></Tooltip>
      <Popover open={filtersOpen} onOpenChange={(open, details) => {
        if (!open && details.reason === "escape-key" && nestedEscapeRef.current) return
        setFiltersOpen(open)
        if (open) setSearchOpen(false)
      }}>
        <PopoverTrigger
          render={
            <Button
              ref={filterTriggerRef}
              variant="ghost"
              size="sm"
              data-gallery-command="filters"
              data-gallery-active={activeFilterCount ? "true" : undefined}
              aria-label={activeFilterCount ? `Filtres, ${activeFilterCount} actifs` : "Filtres"}
            >
              <Filter data-icon="inline-start" />
              {activeFilterCount > 0 && <span className="gallery-filter-count">{activeFilterCount}</span>}
            </Button>
          }
        />
        <PopoverContent
          align="start"
          sideOffset={6}
          finalFocus={filterTriggerRef}
          className="gallery-filter-popover tw:w-[min(320px,calc(100vw-24px))] tw:gap-0 tw:p-0"
        >
          <GalleryFileTypePanel
            state={fileTypeState}
            folder={folder}
            collectionItems={collectionItems}
          />
        </PopoverContent>
      </Popover>

      </div>

      <div className="gallery-command-spacer" />
      <div className="gallery-command-group" data-gallery-group="display" role="group" aria-label="Affichage et outils">
      <GalleryViewSwitch/>
      <GalleryPresentation/>
      <DropdownMenu modal={false}>
        <Tooltip label="Trier"><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" data-gallery-command="sort" aria-label="Trier"><ArrowDownUp/></Button>}/></Tooltip>
        <DropdownMenuContent align="end" className="gallery-refined-menu tw:w-48"><DropdownMenuGroup><DropdownMenuLabel>Trier par</DropdownMenuLabel>{[{value:"name",label:"Nom"},{value:"type",label:"Type"},{value:"mtime",label:"Modification"},{value:"btime",label:"Création"},{value:"size",label:"Taille"},{value:"status",label:"Statut"},{value:"rating",label:"Note"}].map(option => <DropdownMenuCheckboxItem key={option.value} checked={sortKey === option.value} onClick={() => setSort(option.value, sortDescending)}>{option.label}</DropdownMenuCheckboxItem>)}</DropdownMenuGroup><DropdownMenuSeparator/><DropdownMenuGroup><DropdownMenuCheckboxItem checked={!sortDescending} onClick={() => setSort(sortKey,false)}>Ordre croissant</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem checked={sortDescending} onClick={() => setSort(sortKey,true)}>Ordre décroissant</DropdownMenuCheckboxItem></DropdownMenuGroup></DropdownMenuContent>
      </DropdownMenu>
      <Tooltip label={rescanning ? "Actualisation…" : "Rescanner la galerie"}><Button variant="ghost" size="icon-sm" disabled={rescanning} onClick={() => clickLegacy("rescan")} data-gallery-command="rescan" aria-label="Rescanner la galerie">{rescanning ? <Spinner/> : <RefreshCw/>}</Button></Tooltip>

      <DropdownMenu modal={false}>
        <Tooltip label="Autres actions">
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" data-gallery-command="tools" aria-label="Autres actions"><Ellipsis /></Button>} />
        </Tooltip>
        <DropdownMenuContent align="end" className="gallery-refined-menu tw:w-48">
          <DropdownMenuGroup>

            <DropdownMenuItem onClick={() => clickLegacy("viewChip")}><Settings data-icon="inline-start" /> Réglages de la galerie…</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => clickLegacy("boardChip")}><LayoutGrid data-icon="inline-start" /> Board</DropdownMenuItem>
            <DropdownMenuItem onClick={() => clickLegacy("notesChip")}><NotebookPen data-icon="inline-start" /> Notes</DropdownMenuItem>
          </DropdownMenuGroup>
          {recentItems.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Fichiers récents</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuGroup>
                      {recentItems.map((item) => (
                        <DropdownMenuItem key={item.key} onClick={() => item.element.click()}>{item.label}</DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      </div>


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

  const presentation = request ? presentConfirmation(request) : null

  return (
    <AlertDialog open={Boolean(request)} onOpenChange={(nextOpen) => { if (!nextOpen) settle(false) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          {presentation?.destructive && (
            <AlertDialogMedia variant="destructive">
              <Trash2 />
            </AlertDialogMedia>
          )}
          <AlertDialogTitle>{presentation?.title}</AlertDialogTitle>
          {presentation?.description && (
            <AlertDialogDescription>{presentation.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter variant="plain">
          <AlertDialogCancel variant="ghost" onClick={() => settle(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={presentation?.destructive ? "destructive" : "default"}
            data-gallery-confirm="accept"
            onClick={() => settle(true)}
          >
            {presentation?.acceptLabel || "Delete"}
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
