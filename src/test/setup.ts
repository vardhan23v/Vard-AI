import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Testing Library only auto-cleans when test globals are on; we import from "vitest" instead.
afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-reduced-motion");
});
