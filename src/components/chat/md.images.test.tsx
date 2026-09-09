import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { localImagePreviewUrl } from "../../lib/localImage";
import { MarkdownImage, MD_COMPONENTS, MdBody } from "./md";

vi.mock("../../lib/localImage", () => ({ localImagePreviewUrl: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("loads a local Markdown figure through the native image reader and releases it", async () => {
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.mocked(localImagePreviewUrl).mockResolvedValue("blob:figure");
  const view = render(<MdBody text="![Figure](/Users/test/figure.png)" streaming={false}
    components={MD_COMPONENTS} remarkPlugins={[]} rehypePlugins={[]} />);
  expect(await screen.findByRole("img", { name: "Figure" })).toHaveAttribute("src", "blob:figure");
  expect(localImagePreviewUrl).toHaveBeenCalledWith("/Users/test/figure.png");
  view.unmount();
  expect(revoke).toHaveBeenCalledWith("blob:figure");
});

it("releases a late image result after unmounting", async () => {
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  let resolve!: (value: string) => void;
  vi.mocked(localImagePreviewUrl).mockReturnValue(new Promise(r => { resolve = r; }));
  const view = render(<MarkdownImage src="/Users/test/figure.png" />);
  view.unmount(); resolve("blob:late");
  await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:late"));
});

it("reports an unreadable file instead of leaving a broken image", async () => {
  vi.mocked(localImagePreviewUrl).mockRejectedValue(new Error("missing"));
  render(<MarkdownImage src="/Users/test/missing.png" alt="Figure" />);
  expect(await screen.findByText("Image indisponible : Figure")).toBeVisible();
  expect(screen.queryByRole("img")).toBeNull();
});
