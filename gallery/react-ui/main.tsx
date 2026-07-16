import * as React from "react"
import { createRoot } from "react-dom/client"
import {
  ArrowUpDown,
  Check,
  CheckSquare2,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Filter,
  Flag,
  FolderOpen,
  LayoutGrid,
  Library,
  NotebookPen,
  Plus,
  RefreshCw,
  RotateCcw,
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

const OUTPUT_TYPE_KEYS = new Set(["png", "jpg", "svg", "mp4", "pdf", "html", "docx", "xlsx", "csv", "md"])

function stripLegacyCount(label: string) {
  return label.replace(/\s+\d+$/, "").trim()
}

function sortLabel(value: string) {
  const labels: Record<string, string> = {
    mtime: "Modified ↓",
    mtime_asc: "Modified ↑",
    btime: "Created ↓",
    btime_asc: "Created ↑",
    name: "Name A–Z",
    size: "Size ↓",
    rating: "Rating ↓",
  }
  return labels[value] ?? value
}

const SORT_REVERSE: Record<string, string> = {
  mtime: "mtime_asc",
  mtime_asc: "mtime",
  btime: "btime_asc",
  btime_asc: "btime",
}

function readActiveFilterChips(fileTypes: GalleryFileTypeState | null) {
  return [...document.querySelectorAll<HTMLElement>("#activeChips [data-fx]:not([data-fx='fav'])")].map((remove) => {
    const key = remove.dataset.fx ?? "filter"
    let label = remove.parentElement?.textContent?.replace("×", "").trim() || "Filter"
    if (key === "fmt" && fileTypes?.summary) label = fileTypes.summary
    else label = label.replace(/^(Formats|Status|Folder|Collection):\s*/, "")
    return { key, label, remove }
  })
}

function GalleryFileTypePanel({
  state,
  folder,
  collectionItems,
}: {
  state: GalleryFileTypeState
  folder: HTMLSelectElement | null
  collectionItems: LegacyMenuItem[]
}) {
  const [query, setQuery] = React.useState("")
  const [customizing, setCustomizing] = React.useState(false)
  const [creatingPreset, setCreatingPreset] = React.useState(false)
  const [presetName, setPresetName] = React.useState("")
  const [showAllTypes, setShowAllTypes] = React.useState(false)
  const [showOtherFilters, setShowOtherFilters] = React.useState(false)
  const adapter = window.__galleryFileTypes
  const activeKeys = state.types.filter((type) => type.active).map((type) => type.key)
  const pinnedTypes = state.pinned
    .map((key) => state.types.find((type) => type.key === key))
    .filter((type): type is GalleryFileType => Boolean(type))
  const outputTypes = pinnedTypes.filter((type) => OUTPUT_TYPE_KEYS.has(type.key))
  const sourceTypes = pinnedTypes.filter((type) => !OUTPUT_TYPE_KEYS.has(type.key))
  const matchingTypes = state.types.filter((type) => {
    const needle = query.trim().toLowerCase()
    return !needle || type.key.includes(needle) || type.label.toLowerCase().includes(needle)
  })
  const folderItems = selectOptions("folder").map((option) => ({
    value: option.value,
    label: option.value ? option.label : "All folders",
  }))

  const updateTypeGroup = (keys: string[], next: string[]) => {
    const group = new Set(keys)
    adapter?.setActive([...activeKeys.filter((key) => !group.has(key)), ...next])
  }

  const savePreset = () => {
    const name = presetName.trim()
    if (!name) return
    adapter?.savePreset(name)
    setPresetName("")
    setCreatingPreset(false)
  }

  if (customizing) {
    return (
      <>
        <PopoverHeader className="gallery-filter-panel-head">
          <PopoverTitle className="tw:sr-only">File types</PopoverTitle>
          <PopoverDescription className="tw:sr-only">Customize quick file types for this project</PopoverDescription>
          <div>
            <div className="gallery-filter-panel-title">Customize Quick Types</div>
            <div className="gallery-filter-helper">Saved for {state.projectName}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setCustomizing(false)}>Done</Button>
        </PopoverHeader>
        <Separator />
        <div className="gallery-filter-scroll">
          <div className="gallery-filter-section">
            <div className="gallery-filter-section-label">Choose pinned types</div>
            <ToggleGroup
              multiple
              value={state.pinned}
              onValueChange={(values) => adapter?.setPinned(values)}
              className="gallery-type-customize-grid"
              aria-label="Quick file types for this project"
            >
              {state.types.map((type) => (
                <ToggleGroupItem
                  key={type.key}
                  value={type.key}
                  variant="outline"
                  size="sm"
                  data-gallery-customize-type={type.key}
                >
                  <Star data-icon="inline-start" />
                  {type.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
      </>
    )
  }

  const renderQuickGroup = (label: string, types: GalleryFileType[]) => {
    if (!types.length) return null
    const keys = types.map((type) => type.key)
    return (
      <div className="gallery-type-group">
        <div className="gallery-filter-sub-label">{label}</div>
        <ToggleGroup
          multiple
          value={activeKeys.filter((key) => keys.includes(key))}
          onValueChange={(values) => updateTypeGroup(keys, values)}
          className="gallery-quick-types"
          aria-label={`${label.toLowerCase()} file types`}
        >
          {types.map((type) => (
            <ToggleGroupItem
              key={type.key}
              value={type.key}
              variant="outline"
              size="xs"
              data-gallery-quick-type={type.key}
              data-gallery-active={type.active ? "true" : undefined}
            >
              {type.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    )
  }

  return (
    <>
      <PopoverTitle className="tw:sr-only">File types</PopoverTitle>
      <PopoverDescription className="tw:sr-only">Filter files and customize quick file types for this project</PopoverDescription>
      <div className="gallery-filter-scroll" data-gallery-file-type-panel>
        <section className="gallery-filter-section" aria-labelledby="quick-types-heading">
          <div className="gallery-filter-section-heading">
            <div>
              <div id="quick-types-heading" className="gallery-filter-section-label">Quick Types</div>
              <div className="gallery-filter-helper">Pinned for this project</div>
            </div>
            <Tooltip label="Customize quick types">
              <Button variant="ghost" size="icon-xs" aria-label="Customize quick types" onClick={() => setCustomizing(true)}>
                <Settings />
              </Button>
            </Tooltip>
          </div>
          {renderQuickGroup("Outputs", outputTypes)}
          {renderQuickGroup("Sources", sourceTypes)}
        </section>

        <Separator />

        <section className="gallery-filter-section" aria-labelledby="project-presets-heading">
          <div>
            <div id="project-presets-heading" className="gallery-filter-section-label">Project Presets</div>
            <div className="gallery-filter-helper">Saved only in this project</div>
          </div>
          <div className="gallery-project-presets">
            {state.presets.map((preset) => (
              <div key={preset.id} className="gallery-project-preset">
                <Button
                  variant={preset.active ? "secondary" : "outline"}
                  size="xs"
                  data-gallery-file-preset={preset.id}
                  onClick={() => adapter?.applyPreset(preset.id)}
                >
                  {preset.label}
                </Button>
                {preset.custom && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Delete preset ${preset.label}`}
                    onClick={() => adapter?.removePreset(preset.id)}
                  >
                    <X />
                  </Button>
                )}
              </div>
            ))}
            <Tooltip label="New preset">
              <Button variant="outline" size="icon-xs" data-gallery-new-preset aria-label="New preset" onClick={() => setCreatingPreset(true)}>
                <Plus />
              </Button>
            </Tooltip>
          </div>
          {creatingPreset && (
            <InputGroup data-gallery-preset-form>
              <InputGroupInput
                aria-label="New preset name"
                placeholder="Preset name…"
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") { event.preventDefault(); savePreset() }
                  if (event.key === "Escape") { event.stopPropagation(); setCreatingPreset(false) }
                }}
                autoFocus
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton onClick={savePreset} disabled={!presetName.trim()}>Save</InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          )}
        </section>

        <section aria-labelledby="all-file-types-heading">
          <Button
            variant="ghost"
            size="sm"
            className="gallery-filter-disclosure"
            aria-expanded={showAllTypes}
            onClick={() => setShowAllTypes((open) => !open)}
          >
            <span id="all-file-types-heading">All file types</span>
            {showAllTypes ? <ChevronDown data-icon="inline-end" /> : <ChevronRight data-icon="inline-end" />}
          </Button>
          {showAllTypes && (
            <div className="gallery-filter-collapsible-content">
              <InputGroup>
                <InputGroupInput
                  aria-label="Search file types"
                  placeholder="Search extension or language…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <InputGroupAddon align="inline-start" aria-hidden="true"><Search /></InputGroupAddon>
              </InputGroup>
              <div className="gallery-all-types" role="list" aria-label="All file types">
                {matchingTypes.map((type) => (
                  <div key={type.key} className="gallery-all-type-row" role="listitem">
                    <Button
                      variant="ghost"
                      size="sm"
                      data-gallery-file-type={type.key}
                      aria-pressed={type.active}
                      onClick={() => updateTypeGroup([type.key], type.active ? [] : [type.key])}
                    >
                      {type.active && <Check data-icon="inline-start" />}
                      {type.label}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${type.pinned ? "Unpin" : "Pin"} ${type.label} for this project`}
                      aria-pressed={type.pinned}
                      data-gallery-pin-type={type.key}
                      onClick={() => adapter?.setPinned(type.pinned
                        ? state.pinned.filter((key) => key !== type.key)
                        : [...state.pinned, type.key])}
                    >
                      <Star />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section aria-labelledby="other-filters-heading">
          <Button
            variant="ghost"
            size="sm"
            className="gallery-filter-disclosure"
            aria-expanded={showOtherFilters}
            onClick={() => setShowOtherFilters((open) => !open)}
          >
            <span id="other-filters-heading">Folders & collections</span>
            {showOtherFilters ? <ChevronDown data-icon="inline-end" /> : <ChevronRight data-icon="inline-end" />}
          </Button>
          {showOtherFilters && (
            <div className="gallery-filter-section gallery-other-filters">
              <div className="gallery-other-filter-row">
                <FolderOpen aria-hidden="true" />
                <Select
                  items={folderItems}
                  modal={false}
                  value={folder?.value ?? ""}
                  onValueChange={(value) => setSelect("folder", value ?? "")}
                >
                  <SelectTrigger size="sm" aria-label="Filter by folder">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {folderItems.map((option) => (
                        <SelectItem key={option.value || "all"} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              {collectionItems.length > 0 && (
                <div className="gallery-type-group">
                  <div className="gallery-filter-sub-label">Collections</div>
                  <div className="gallery-collection-filters">
                    {collectionItems.map((item) => (
                      <Button key={item.key} variant={item.active ? "secondary" : "outline"} size="sm" onClick={() => item.element.click()}>
                        {stripLegacyCount(item.label)}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
      <Separator />
      <div className="gallery-filter-panel-foot">
        <Button variant="ghost" size="sm" onClick={() => adapter?.resetFilters()}>
          <RotateCcw data-icon="inline-start" />
          Reset filters
        </Button>
      </div>
    </>
  )
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
  const filterTriggerRef = React.useRef<HTMLButtonElement>(null)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [filtersOpen, setFiltersOpen] = React.useState(false)
  const [collectionOpen, setCollectionOpen] = React.useState(false)
  const [newCollection, setNewCollection] = React.useState("")
  const search = get<HTMLInputElement>("q")?.value ?? ""
  const sort = get<HTMLSelectElement>("sort")
  const folder = get<HTMLSelectElement>("folder")
  const favorite = get<HTMLElement>("favChip")
  const rescanning = get<HTMLElement>("rescan")?.classList.contains("spinning") === true
  const density = get<HTMLElement>("densitySeg")?.querySelector<HTMLElement>("button.on")?.dataset.d ?? "m"
  const collectionItems = legacyItems("collMenu", "[data-pick]")
  const workflowItems = legacyItems("wfMenu", "[data-wfpick]")
  const recentItems = legacyItems("recMenu", "[data-rec]")
  const fileTypeState = window.__galleryFileTypes?.getState() ?? {
    projectName: "this project",
    types: legacyItems("fmtMenu", "input[data-fmt]").map((item) => ({
      key: item.key, label: stripLegacyCount(item.label), active: item.active, pinned: false,
    })),
    pinned: [], presets: [], summary: "File types",
  }
  const selection = window.__gallerySelection?.getState() ?? { rels: [], imageCount: 0 }
  const activeChips = readActiveFilterChips(fileTypeState)
  const activeFilterCount = document.querySelectorAll("#activeChips [data-fx]:not([data-fx='fav'])").length
  const favoriteActive = favorite?.classList.contains("on") === true
  const sortItems = selectOptions("sort").map((option) => ({ value: option.value, label: sortLabel(option.value) }))
  const currentSort = sort?.value ?? "mtime"
  const reverseSort = SORT_REVERSE[currentSort]
  const statusActive = workflowItems.some((item) => item.active && item.key !== "")
  const collectionActive = collectionItems.some((item) => item.active)
  const clearCollection = () => get<HTMLElement>("collMenu")?.querySelector<HTMLElement>("[data-clear]")?.click()
  const submitNewCollection = () => {
    const name = newCollection.trim()
    if (!name) return
    const input = get<HTMLInputElement>("collQuick")
    const addButton = get<HTMLElement>("collQuickAdd")
    if (input && addButton) {
      input.value = name
      addButton.click()
    }
    setNewCollection("")
  }

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
      if (event.key !== "Escape") return
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
        <div className="gallery-selection-count" aria-live="polite">
          <CheckSquare2 aria-hidden="true" />
          <span>{selection.rels.length} selected</span>
        </div>
        <div className="gallery-command-spacer" />
        {selection.rels.length === 1 && (
          <Button variant="outline" size="sm" data-gallery-selection-action="open" onClick={() => selectionAdapter?.open()}>Open</Button>
        )}
        {selection.imageCount >= 2 && (
          <Button variant="outline" size="sm" data-gallery-selection-action="compare" onClick={() => selectionAdapter?.compare()}>Compare</Button>
        )}
        <Button variant="outline" size="sm" data-gallery-selection-action="collect" onClick={(event) => { event.stopPropagation(); selectionAdapter?.collect(event.currentTarget) }}>Collect</Button>
        <Button variant="outline" size="sm" data-gallery-selection-action="export" onClick={(event) => { event.stopPropagation(); selectionAdapter?.export(event.currentTarget) }}>
          Export <ChevronDown data-icon="inline-end" />
        </Button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More selection actions"><Ellipsis /></Button>} />
          <DropdownMenuContent align="end" className="tw:w-48">
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
      <div className="gallery-command-group" role="group" aria-label="Search and filter gallery">
      <Popover open={searchOpen} onOpenChange={(open) => {
        setSearchOpen(open)
        if (open) setFiltersOpen(false)
      }}>
        <Tooltip label={search ? "Edit search" : "Search files (/)"}>
          <PopoverTrigger
            render={
              <Button
                variant={search ? "secondary" : "outline"}
                size="icon-sm"
                aria-label={search ? `Search files: ${search}` : "Search files"}
                aria-pressed={searchOpen}
              >
                <Search />
              </Button>
            }
          />
        </Tooltip>
        <PopoverContent align="start" sideOffset={6} className="gallery-search-popover tw:gap-0 tw:p-2">
          <PopoverTitle className="tw:sr-only">Search project files</PopoverTitle>
          <PopoverDescription className="tw:sr-only">Search by file name or folder</PopoverDescription>
          <InputGroup data-gallery-command-group="search">
            <InputGroupInput
              aria-label="Search project files"
              data-gallery-command="search"
              placeholder="Search by name or folder…"
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
              autoFocus
            />
            <InputGroupAddon align="inline-start" aria-hidden="true"><Search /></InputGroupAddon>
            {search && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => updateSearch("")}><X /></InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
        </PopoverContent>
      </Popover>

      <Popover open={filtersOpen} onOpenChange={(open) => {
        setFiltersOpen(open)
        if (open) setSearchOpen(false)
      }}>
        <PopoverTrigger
          render={
            <Button
              ref={filterTriggerRef}
              variant={activeFilterCount ? "secondary" : "outline"}
              size="sm"
              data-gallery-command="filters"
              aria-label={activeFilterCount ? `Filters, ${activeFilterCount} active` : "Filters"}
            >
              <Filter data-icon="inline-start" />
              <span className="gallery-filter-label">Filters{activeFilterCount ? ` ${activeFilterCount}` : ""}</span>
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

      <Button
        variant={favoriteActive ? "secondary" : "outline"}
        size="sm"
        data-gallery-command="favorites"
        aria-label="Favorites"
        aria-pressed={favoriteActive}
        onClick={() => clickLegacy("favChip")}
      >
        <Star data-icon="inline-start" fill={favoriteActive ? "currentColor" : "none"} />
        <span className="gallery-fav-label">Favorites</span>
      </Button>

      <Popover open={collectionOpen} onOpenChange={setCollectionOpen}>
        <PopoverTrigger render={
          <Button variant="outline" size="sm" data-gallery-command="collection" data-gallery-active={collectionActive ? "true" : undefined} aria-label="Collections">
            <Library data-icon="inline-start" />
            <span className="gallery-collection-label">Collection</span>
          </Button>
        } />
        <PopoverContent align="start" className="tw:flex tw:flex-col tw:gap-1 tw:w-56 tw:p-1">
          <PopoverTitle className="tw:sr-only">Collections</PopoverTitle>
          <Button variant="ghost" size="sm" className="tw:w-full tw:justify-start" onClick={() => { clearCollection(); setCollectionOpen(false) }}>
            <Check data-icon="inline-start" className={collectionActive ? "tw:opacity-0" : ""} />
            All collections
          </Button>
          {collectionItems.map((item) => (
            <Button key={item.key} variant="ghost" size="sm" className="tw:w-full tw:justify-start" onClick={() => { item.element.click(); setCollectionOpen(false) }}>
              <Check data-icon="inline-start" className={item.active ? "" : "tw:opacity-0"} />
              {stripLegacyCount(item.label)}
            </Button>
          ))}
          <Separator className="tw:my-1" />
          <InputGroup>
            <InputGroupInput
              value={newCollection}
              onChange={(event) => setNewCollection(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submitNewCollection() } }}
              placeholder="New collection…"
              aria-label="New collection name"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label="Create collection" disabled={!newCollection.trim()} onClick={submitNewCollection}><Plus /></InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </PopoverContent>
      </Popover>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger render={
          <Button variant="outline" size="sm" data-gallery-command="status" data-gallery-active={statusActive ? "true" : undefined} aria-label="Filter by status">
            <Flag data-icon="inline-start" />
            <span className="gallery-status-label">Status</span>
          </Button>
        } />
        <DropdownMenuContent align="start" className="tw:w-48">
          <DropdownMenuGroup>
            {workflowItems.map((item) => (
              <DropdownMenuCheckboxItem
                key={item.key || "all"}
                checked={item.active}
                data-gallery-status={item.key}
                onClick={() => item.element.click()}
              >
                {item.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>

      <div className="gallery-command-group" role="group" aria-label="Sort and display gallery">
      <Select items={sortItems} modal={false} value={sort?.value ?? "mtime"} onValueChange={(value) => value && setSelect("sort", value)}>
        <SelectTrigger
          size="sm"
          className="gallery-command-select gallery-command-sort"
          aria-label={`Sort project files: ${sortLabel(sort?.value ?? "mtime")}`}
        >
          <SelectValue>{(value) => sortLabel(String(value))}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {sortItems.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Tooltip label={reverseSort ? "Reverse sort direction" : "No reverse for this sort"}>
        <Button
          variant="outline"
          size="icon-sm"
          data-gallery-command="sort-dir"
          aria-label="Reverse sort direction"
          disabled={!reverseSort}
          onClick={() => reverseSort && setSelect("sort", reverseSort)}
        >
          <ArrowUpDown />
        </Button>
      </Tooltip>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" aria-label="View options"><LayoutGrid data-icon="inline-start" /><span className="gallery-view-label">View</span></Button>} />
        <DropdownMenuContent align="end" className="tw:w-44">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Card size</DropdownMenuLabel>
            {[{ key: "s", label: "Compact" }, { key: "m", label: "Standard" }, { key: "l", label: "Large" }].map((item) => (
              <DropdownMenuCheckboxItem
                key={item.key}
                checked={density === item.key}
                data-gallery-density={item.key}
                onClick={() => get<HTMLElement>("densitySeg")?.querySelector<HTMLElement>(`[data-d="${item.key}"]`)?.click()}
              >
                {item.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>

      <Tooltip label={rescanning ? "Rescanning…" : "Rescan project"}>
        <Button
          variant="outline"
          size="icon-sm"
          data-gallery-command="rescan"
          aria-label="Rescan project"
          disabled={rescanning}
          onClick={() => clickLegacy("rescan")}
        >
          {rescanning ? <Spinner /> : <RefreshCw />}
        </Button>
      </Tooltip>

      <DropdownMenu modal={false}>
        <Tooltip label="Gallery tools">
          <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label="Gallery tools"><Ellipsis /></Button>} />
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
          {recentItems.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Recent files</DropdownMenuSubTrigger>
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

      <div className="gallery-active-filters" aria-label="Active filters">
        {activeChips.map((chip) => (
          <Button
            key={chip.key}
            variant="outline"
            size="xs"
            className="gallery-filter-chip"
            data-gallery-filter-chip={chip.key}
            aria-label={`Remove filter ${chip.label}`}
            onClick={() => chip.remove.click()}
          >
            {chip.label}
            <X data-icon="inline-end" />
          </Button>
        ))}
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
