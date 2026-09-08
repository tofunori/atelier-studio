import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DropdownMenuSurface } from "./DropdownMenuSurface"
import { LazyDropdownMenu } from "./LazyDropdownMenu"

afterEach(cleanup)

function Fixture({ onSelect = vi.fn() }: { onSelect?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <DropdownMenuSurface
      open={open}
      onOpenChange={setOpen}
      label="Actions"
      header="Conversation"
      trigger={<button type="button">Actions</button>}
      items={[
        { key: "rename", label: "Rename", onSelect },
        { key: "delete", label: "Delete", destructive: true, onSelect },
      ]}
    />
  )
}

function LazyKeepOpenFixture({ onSelect = vi.fn() }: { onSelect?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <LazyDropdownMenu
      open={open}
      onOpenChange={setOpen}
      label="Actions"
      trigger={<button type="button">Actions</button>}
      items={[{ key: "next", label: "Next", keepOpen: true, onSelect }]}
    />
  )
}

describe("DropdownMenuSurface", () => {
  it("uses Base UI menu semantics and closes after selecting an item", async () => {
    const onSelect = vi.fn()
    render(<Fixture onSelect={onSelect} />)

    const trigger = screen.getByRole("button", { name: "Actions" })
    expect(trigger).toHaveAttribute("aria-haspopup", "menu")
    fireEvent.click(trigger)

    const menu = await waitFor(() => screen.getByRole("menu", { name: "Actions" }))
    expect(menu).toBeInTheDocument()
    expect(screen.getByText("Conversation")).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
  })

  it("expose un sous-menu Base UI pour les actions secondaires", async () => {
    const onCodex = vi.fn()
    render(
      <DropdownMenuSurface
        open
        onOpenChange={() => {}}
        label="Actions"
        trigger={<button type="button">Actions</button>}
        items={[{
          key: "continue",
          label: "Continue with…",
          children: [{ key: "codex", label: "Codex", onSelect: onCodex }],
        }]}
      />,
    )

    fireEvent.click(await screen.findByRole("menuitem", { name: "Continue with…" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Codex" }))
    expect(onCodex).toHaveBeenCalledTimes(1)
  })

  it("rend un pied non cliquable après les items, distinct du header", async () => {
    render(
      <DropdownMenuSurface
        open
        onOpenChange={() => {}}
        label="Notes"
        header="Conversation"
        footer="Contexte additionnel"
        trigger={<button type="button">Notes</button>}
        items={[{ key: "rename", label: "Rename", onSelect: () => {} }]}
      />,
    )

    const menu = await screen.findByRole("menu", { name: "Notes" })
    expect(menu).toBeInTheDocument()
    const footer = screen.getByText("Contexte additionnel")
    expect(footer).toHaveClass("dropdown-surface-footer")
    expect(screen.queryByRole("menuitem", { name: "Contexte additionnel" })).toBeNull()
  })

  it("partage les groupes et garde une action ouverte quand keepOpen est demandé", async () => {
    const onToggle = vi.fn()
    render(
      <DropdownMenuSurface
        open
        onOpenChange={() => {}}
        label="Actions"
        trigger={<button type="button">Actions</button>}
        groups={[
          {
            key: "view",
            label: "Affichage",
            items: [{ key: "compact", label: "Compact", checked: true, onSelect: onToggle }],
          },
          {
            key: "more",
            separatorBefore: true,
            items: [{ key: "next", label: "Suivant", keepOpen: true, onSelect: onToggle }],
          },
        ]}
      />,
    )

    expect(screen.getByText("Affichage")).toBeInTheDocument()
    const compact = screen.getByRole("menuitemcheckbox", { name: "Compact" })
    expect(compact).toHaveAttribute("data-checked")
    fireEvent.click(compact)
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("menu", { name: "Actions" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("menuitem", { name: "Suivant" }))
    expect(onToggle).toHaveBeenCalledTimes(2)
    expect(screen.getByRole("menu", { name: "Actions" })).toBeInTheDocument()
  })

  it("ferme au premier Escape après une action keepOpen", async () => {
    const onSelect = vi.fn()
    render(<LazyKeepOpenFixture onSelect={onSelect} />)
    const trigger = screen.getByRole("button", { name: "Actions" })
    fireEvent.click(trigger)
    await act(async () => {
      await vi.dynamicImportSettled()
    })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Next" }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    const menu = screen.getByRole("menu", { name: "Actions" })
    fireEvent.keyDown(menu, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    expect(trigger).toHaveFocus()
  })
})
