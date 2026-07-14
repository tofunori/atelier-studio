import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImageViewer } from "./ImageViewer.tsx";

describe("ImageViewer", () => {
  it("zooms only the image with its controls", () => {
    render(<ImageViewer url="blob:test" name="figure.png" />);

    const image = screen.getByRole("img", { name: "figure.png" });
    fireEvent.click(screen.getByRole("button", { name: "Agrandir" }));

    expect(screen.getByText("120 %")).toBeInTheDocument();
    expect(image).toHaveStyle({ transform: "translate3d(0px, 0px, 0) scale(1.2)" });

    fireEvent.click(screen.getByRole("button", { name: "Taille réelle" }));
    expect(screen.getByText("100 %")).toBeInTheDocument();
  });

  it("captures a two-finger pinch inside the image stage", () => {
    const { container } = render(<ImageViewer url="blob:test" name="figure.png" />);
    const stage = container.querySelector(".viewer-image-stage") as HTMLElement;

    fireEvent.pointerDown(stage, { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 100 });
    fireEvent.pointerDown(stage, { pointerId: 2, pointerType: "touch", clientX: 200, clientY: 100 });
    fireEvent.pointerMove(stage, { pointerId: 2, pointerType: "touch", clientX: 250, clientY: 100 });

    expect(screen.getByText("150 %")).toBeInTheDocument();
    expect(stage).toHaveAttribute("data-zoomed", "true");
  });
});
