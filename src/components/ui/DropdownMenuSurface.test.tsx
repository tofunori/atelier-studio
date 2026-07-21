import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { DropdownMenuSurface } from "./DropdownMenuSurface"

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
})
