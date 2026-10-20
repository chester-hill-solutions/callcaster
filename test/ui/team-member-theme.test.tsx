import { afterEach, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import TeamMember, { MemberRole } from "@/components/workspace/TeamMember";

const owner = {
  id: "owner",
  username: "owner.person",
  first_name: "Actor",
  last_name: "Owner",
  role: "owner",
};

const routers: ReturnType<typeof createMemoryRouter>[] = [];

afterEach(() => {
  for (const router of routers.splice(0)) router.dispose();
});

describe.each([
  { role: "member", label: "Manage sample.member" },
  { role: "invited", label: "Cancel invite for sample.member" },
])("member icon foreground: $role", ({ role, label }) => {
  test.each([
    { surface: "light", foreground: "rgb(36, 25, 27)" },
    { surface: "dark", foreground: "rgb(247, 245, 242)" },
  ])("inherits the $surface button foreground without a resolved theme", ({ foreground }) => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <TeamMember
            member={{ ...owner, id: "member", username: "sample.member", role }}
            userRole={MemberRole.Owner}
            memberIsUser={false}
            workspaceOwner={owner}
          />
        ),
      },
    ]);
    routers.push(router);
    render(<RouterProvider router={router} />);

    // JSDOM omits Tailwind; supply the button foreground that the SVG must inherit.
    const button = screen.getByRole("button", { name: label });
    button.style.color = foreground;
    const icon = button.querySelector("svg");
    if (!icon) throw new Error("Member button has no icon");
    expect(getComputedStyle(icon).color).toBe(foreground);
  });
});
