import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import * as Icons from "@/components/Icons";

describe("app/components/Icons.tsx", () => {
  test("renders all exported icons", () => {
    const entries = Object.entries(Icons);
    expect(entries.length).toBeGreaterThan(5);

    for (const [name, Icon] of entries) {
      if (typeof Icon !== "function") continue;
      const { unmount } = render(<Icon />);
      unmount();

      // custom props path for a couple icons
      if (name === "SignIcon") {
        const { unmount: unmount2 } = render(<Icon fill="#f00" height="12px" width="34px" text="A" />);
        unmount2();
      }
      if (name === "EditIcon") {
        const { unmount: unmount3 } = render(<Icon fill="#0f0" height="1px" width="2px" />);
        unmount3();
      }
    }
  });
});

