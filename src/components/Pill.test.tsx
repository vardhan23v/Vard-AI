import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Pill } from "./Pill";

const badge = (label: string) => screen.getByText(label).parentElement!;

describe("Pill", () => {
  it("renders the success tone tokens", () => {
    render(<Pill tone="ok">Done</Pill>);
    expect(badge("Done").className).toContain("text-success");
    expect(badge("Done").className).toContain("border-success/50");
  });

  it("renders the warning tone tokens", () => {
    render(<Pill tone="attention">Needs you</Pill>);
    expect(badge("Needs you").className).toContain("text-warning");
    expect(badge("Needs you").className).toContain("border-warning/60");
  });

  it("uses the compact size and optional dot/spinner", () => {
    const { container } = render(
      <Pill tone="live" size="xs" dot spin title="Running">
        Running
      </Pill>,
    );
    const root = container.firstElementChild!;
    expect(root.getAttribute("title")).toBe("Running");
    expect(root.className).toContain("text-[11px]");
    expect(root.querySelector(".animate-spin")).not.toBeNull();
    expect(root.querySelector(".bg-current")).not.toBeNull();
  });
});
