import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DialogSurface } from "./DialogSurface"

afterEach(cleanup)

describe("DialogSurface", () => {
  it("expose le titre accessible et rend le focusable de fermeture", async () => {
    const onOpenChange = vi.fn()
    render(
      <DialogSurface
        open
        onOpenChange={onOpenChange}
        title="Choisir un provider"
        description="Le choix s'applique à cette conversation."
        closeLabel="Fermer"
      >
        <button type="button">Claude</button>
      </DialogSurface>,
    )

    const dialog = screen.getByRole("dialog", { name: "Choisir un provider" })
    expect(dialog).toHaveTextContent("Le choix s'applique à cette conversation.")
    expect(screen.getByRole("button", { name: "Fermer" })).toBeInTheDocument()

    fireEvent.keyDown(dialog, { key: "Escape" })
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything()))
  })

  it("fermé : rien dans le DOM ; ouvert : description liée via aria-describedby", () => {
    const { rerender } = render(
      <DialogSurface open={false} onOpenChange={() => {}} title="T" description="D">
        <span>corps</span>
      </DialogSurface>,
    )
    expect(screen.queryByRole("dialog")).toBeNull()

    rerender(
      <DialogSurface open onOpenChange={() => {}} title="T" description="D">
        <span>corps</span>
      </DialogSurface>,
    )
    const dialog = screen.getByRole("dialog", { name: "T" })
    const describedBy = dialog.getAttribute("aria-describedby")
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)).toHaveTextContent("D")
    expect(dialog).toHaveTextContent("corps")
  })

  it("le bouton de fermeture notifie onOpenChange(false)", async () => {
    const onOpenChange = vi.fn()
    render(
      <DialogSurface open onOpenChange={onOpenChange} title="T" closeLabel="Fermer">
        <span>corps</span>
      </DialogSurface>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything()))
  })

  it("à l'ouverture, le focus entre dans le dialogue (piège modal Base UI)", async () => {
    render(
      <DialogSurface open onOpenChange={() => {}} title="T" closeLabel="Fermer">
        <button type="button">Action</button>
      </DialogSurface>,
    )
    const dialog = screen.getByRole("dialog")
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
  })
})
