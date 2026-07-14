import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DialogSurface } from "./DialogSurface"

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
})
