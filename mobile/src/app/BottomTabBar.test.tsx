import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Tabs } from "@/components/ui/tabs.tsx";
import { BottomTabBar, type AppTab } from "./BottomTabBar.tsx";

function Harness() {
  const [tab, setTab] = useState<AppTab>("chats");
  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as AppTab)}>
      <BottomTabBar />
      <output>{tab}</output>
    </Tabs>
  );
}

describe("BottomTabBar", () => {
  it("keeps the four primary destinations in one accessible tab list", () => {
    render(<Harness />);

    const navigation = screen.getByRole("tablist", { name: "Navigation principale" });
    expect(navigation).toHaveClass("app-tabbar");
    expect(screen.getAllByRole("tab")).toHaveLength(4);

    fireEvent.click(screen.getByRole("tab", { name: "Gallery" }));
    expect(screen.getByText("gallery", { selector: "output" })).toBeInTheDocument();
  });
});
