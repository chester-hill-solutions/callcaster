import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { SmokeRouter } from "./_helpers/component-smoke";

// The credit count lives in the workspace sidebar (WorkspaceNav). It was
// removed from the navbar because it rendered conditionally and shifted the
// workspace dropdown.
describe("app/components/layout/Navbar.tsx credits", () => {
  test("does not render a credit readout for an admin workspace with credits", async () => {
    const Navbar = (await import("@/components/layout/Navbar")).default;
    render(
      <SmokeRouter>
        <Navbar
          handleSignOut={async () => ({ success: null, error: null })}
          workspaces={
            [{ id: "w1", name: "WS", role: "admin", credits: 42 } as never]
          }
          isSignedIn
          user={
            {
              id: "u1",
              username: "user",
              first_name: "Sam",
              workspace_invite: [],
            } as never
          }
          params={{ id: "w1" }}
        />
      </SmokeRouter>,
    );

    expect(screen.queryByTestId("navbar-credits")).toBeNull();
    expect(screen.queryByRole("link", { name: /Credits:/ })).toBeNull();
  });
});
