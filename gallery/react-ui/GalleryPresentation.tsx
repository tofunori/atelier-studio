import * as React from "react"
import { LayoutGrid, List, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/shadcn/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/shadcn/toggle-group"
import { Popover, PopoverTrigger, PopoverContent, PopoverTitle } from "@/components/shadcn/popover"
import { Tooltip } from "@/components/ui/Tooltip"

type Presentation = { mode: "grid" | "list"; size: number; rows: "compact" | "comfortable" }
declare global {
  interface Window {
    __galleryPresentation?: { getState(): Presentation; set(patch: Partial<Presentation>): void }
  }
}
function usePresentation() {
  const [state, update] = React.useState<Presentation>(() => window.__galleryPresentation?.getState() ?? {mode:"grid",size:185,rows:"comfortable"})
  React.useEffect(() => {
    const sync = () => { const next = window.__galleryPresentation?.getState(); if (next) update(next) }
    sync()
    window.addEventListener("atelier-gallery-presentation-change", sync)
    return () => window.removeEventListener("atelier-gallery-presentation-change", sync)
  }, [])
  return {state, set: (patch: Partial<Presentation>) => window.__galleryPresentation?.set(patch)}
}
export function GalleryViewSwitch() {
  const {state, set} = usePresentation()
  return <ToggleGroup value={[state.mode]} onValueChange={value => { if(value[0]) set({mode:value[0] as Presentation["mode"]}) }} className="gallery-view-switch" aria-label="Mode d’affichage">
    <Tooltip label="Grille"><ToggleGroupItem value="grid" aria-label="Grille" data-gallery-command="grid"><LayoutGrid/></ToggleGroupItem></Tooltip>
    <Tooltip label="Liste détaillée"><ToggleGroupItem value="list" aria-label="Liste détaillée" data-gallery-command="list"><List/></ToggleGroupItem></Tooltip>
  </ToggleGroup>
}
export function GalleryPresentation() {
  const {state, set} = usePresentation()
  return <Popover>
    <Tooltip label="Présentation"><PopoverTrigger render={<Button variant="ghost" size="icon-sm" data-gallery-command="view" aria-label="Présentation"><SlidersHorizontal/></Button>}/></Tooltip>
    <PopoverContent align="end" className="gallery-presentation-popover">
      <PopoverTitle>Présentation</PopoverTitle>
      <ToggleGroup value={[state.mode]} onValueChange={value => {if(value[0]) set({mode:value[0] as Presentation["mode"]})}} className="gallery-visual-choices" aria-label="Présentation des fichiers">
        <ToggleGroupItem value="grid" className="gallery-visual-choice"><span className="gallery-mini-grid" aria-hidden="true">{Array.from({length:6},(_,i)=><b key={i}/>)}</span><span>Grille</span></ToggleGroupItem>
        <ToggleGroupItem value="list" className="gallery-visual-choice"><span className="gallery-mini-list" aria-hidden="true">{Array.from({length:3},(_,i)=><b key={i}/>)}</span><span>Liste détaillée</span></ToggleGroupItem>
      </ToggleGroup>
      {state.mode === "grid" ? <>
        <span className="gallery-presentation-label">Taille des vignettes</span>
        <ToggleGroup value={[String(state.size < 205 ? 160 : state.size < 275 ? 240 : 320)]} onValueChange={value => {if(value[0]) set({size:Number(value[0])})}} className="gallery-visual-choices gallery-size-choices" aria-label="Taille des vignettes">
          {[{size:160,label:"Petites",columns:4},{size:240,label:"Standard",columns:3},{size:320,label:"Grandes",columns:2}].map(option => <ToggleGroupItem key={option.size} value={String(option.size)} className="gallery-visual-choice"><span className="gallery-mini-grid" style={{gridTemplateColumns:`repeat(${option.columns}, 1fr)`}} aria-hidden="true">{Array.from({length:option.columns*2},(_,i)=><b key={i}/>)}</span>{option.label}</ToggleGroupItem>)}
        </ToggleGroup>
      </> : <>
        <span className="gallery-presentation-label">Hauteur des lignes</span>
        <ToggleGroup value={[state.rows]} onValueChange={value => {if(value[0])set({rows:value[0] as Presentation["rows"]})}} className="gallery-visual-choices" aria-label="Hauteur des lignes">
          <ToggleGroupItem value="compact" className="gallery-visual-choice"><span className="gallery-density-lines" aria-hidden="true"><i/><i/><i/></span>Compacte</ToggleGroupItem>
          <ToggleGroupItem value="comfortable" className="gallery-visual-choice"><span className="gallery-density-lines roomy" aria-hidden="true"><i/><i/><i/></span>Aérée</ToggleGroupItem>
        </ToggleGroup>
      </>}
    </PopoverContent>
  </Popover>
}
