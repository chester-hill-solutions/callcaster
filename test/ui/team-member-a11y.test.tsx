import { createElement } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import userEvent from "@testing-library/user-event";
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

const owner = {
  id: "u0",
  username: "owner.person",
  first_name: "Actor",
  last_name: "Owner",
  role: "owner",
};

const routers: ReturnType<typeof createMemoryRouter>[] = [];

afterEach(() => {
  for (const router of routers.splice(0)) router.dispose();
});

// TeamMember's invited-member branch renders a <Form>, which (in RR7) needs
// a real data router context even just to mount, not only to submit — a
// declarative <MemoryRouter> alone isn't enough.
function renderWithDataRouter(element: React.ReactElement) {
  const router = createMemoryRouter([{ path: "/", element }], {
    initialEntries: ["/"],
  });
  routers.push(router);
  return render(createElement(RouterProvider, { router }));
}

describe("app/components/workspace/TeamMember.tsx", () => {
  test("the manage-member trigger has an accessible name", () => {
    renderWithDataRouter(
      <TeamMember
        member={activeMember}
        userRole={MemberRole.Admin}
        memberIsUser={false}
        workspaceOwner={owner}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Manage ana.hernandez" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Coordinator")).toBeInTheDocument();
  });

  test("the cancel-invite button has an accessible name", () => {
    renderWithDataRouter(
      <TeamMember
        member={invitedMember}
        userRole={MemberRole.Admin}
        memberIsUser={false}
        workspaceOwner={owner}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Cancel invite for sam.chen" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Invited")).toBeInTheDocument();
  });

  test.each([
    { first_name: "ana", last_name: "hernandez", heading: "Ana Hernandez" },
    { first_name: null, last_name: "hernandez", heading: "Hernandez" },
    { first_name: "ana", last_name: null, heading: "Ana" },
    { first_name: null, last_name: null, heading: "ana.hernandez" },
    { first_name: "", last_name: "", heading: "ana.hernandez" },
  ])("manage sheet identifies the target as $heading", async (names) => {
    const user = userEvent.setup();
    renderWithDataRouter(
      <TeamMember
        member={{
          ...activeMember,
          first_name: names.first_name,
          last_name: names.last_name,
        }}
        userRole={MemberRole.Owner}
        memberIsUser={false}
        workspaceOwner={owner}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Manage ana.hernandez" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Manage Team Member",
    });
    expect(
      within(dialog).getByRole("heading", { level: 4, name: names.heading }),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole("heading", { name: "Actor Owner" }),
    ).not.toBeInTheDocument();
    expect(dialog.querySelectorAll('input[name="user_id"]')).toHaveLength(3);
    for (const input of dialog.querySelectorAll('input[name="user_id"]')) {
      expect(input).toHaveValue("u1");
    }
    expect(
      dialog.querySelector('input[name="workspace_owner_id"]'),
    ).toHaveValue("u0");
  });
});
