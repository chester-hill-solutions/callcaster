import { createElement } from "react";
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import TeamMember, { MemberRole } from "@/components/workspace/TeamMember";

// Regression tests for audit-F's settings button-name axe violations: the
// per-row "manage member" (gear) and "cancel invite" icon buttons had no
// accessible name.
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light" }),
}));

const activeMember = {
  id: "u1",
  username: "ana.hernandez",
  first_name: "Ana",
  last_name: "Hernandez",
  role: "member",
};

const invitedMember = {
  id: "u2",
  username: "sam.chen",
  first_name: "Sam",
  last_name: "Chen",
  role: "invited",
};

const owner = { id: "u0", username: "owner.person", role: "owner" };

// TeamMember's invited-member branch renders a <Form>, which (in RR7) needs
// a real data router context even just to mount, not only to submit — a
// declarative <MemoryRouter> alone isn't enough.
function renderWithDataRouter(element: React.ReactElement) {
  const router = createMemoryRouter([{ path: "/", element }], {
    initialEntries: ["/"],
  });
  return render(createElement(RouterProvider, { router }));
}

describe("app/components/workspace/TeamMember.tsx", () => {
  test("the manage-member trigger has an accessible name", () => {
    renderWithDataRouter(
      <TeamMember
        member={activeMember as never}
        userRole={MemberRole.Admin}
        memberIsUser={false}
        workspaceOwner={owner as never}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Manage ana.hernandez" }),
    ).toBeInTheDocument();
  });

  test("the cancel-invite button has an accessible name", () => {
    renderWithDataRouter(
      <TeamMember
        member={invitedMember as never}
        userRole={MemberRole.Admin}
        memberIsUser={false}
        workspaceOwner={owner as never}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Cancel invite for sam.chen" }),
    ).toBeInTheDocument();
  });
});
