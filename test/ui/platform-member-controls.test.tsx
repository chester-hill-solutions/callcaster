import { createElement } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import TeamMember, { MemberRole } from "@/components/workspace/TeamMember";

vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light" }) }));
const target = { id: "owned-target", username: "owned-target@example.test", first_name: "Owned", last_name: "Target", role: "member" };
const owner = { ...target, id: "owned-owner", username: "owned-owner@example.test", role: "owner" };
const routers: ReturnType<typeof createMemoryRouter>[] = [];
afterEach(() => { for (const router of routers.splice(0)) router.dispose(); });
function mount(role: MemberRole, platformAdmin = false, member = target) {
  const element = <TeamMember member={member} userRole={role} memberIsUser={false} workspaceOwner={owner} platformAdmin={platformAdmin} />;
  const router = createMemoryRouter([{ path: "/", element }], { initialEntries: ["/"] });
  routers.push(router);
  render(createElement(RouterProvider, { router }));
}

describe("explicit platform membership controls (#2138)", () => {
  test.each([MemberRole.Caller, MemberRole.Member, MemberRole.Admin, MemberRole.Owner])(
    "platform access permits owner recovery with display membership %s", async role => {
      const user = userEvent.setup();
      mount(role, true);
      await user.click(screen.getByRole("button", { name: "Manage owned-target@example.test" }));
      const roles = screen.getByRole("combobox", { name: "Workspace Role" });
      expect(screen.getByRole("option", { name: "Workspace owner" })).toHaveValue("owner");
      await user.selectOptions(roles, "owner");
      expect(roles).toHaveValue("owner");
      expect(screen.getByRole("button", { name: "Update Team Member" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Remove Team Member" })).toBeVisible();
      expect(screen.queryByRole("button", { name: "Transfer Workspace Ownership" })).not.toBeInTheDocument();
    },
  );
  test("platform management exposes the existing owner's controls", async () => {
    const user = userEvent.setup();
    mount(MemberRole.Member, true, owner);
    await user.click(screen.getByRole("button", { name: "Manage owned-owner@example.test" }));
    expect(screen.getByRole("combobox", { name: "Workspace Role" })).toHaveValue("owner");
    expect(screen.getByRole("button", { name: "Remove Team Member" })).toBeVisible();
  });
  test("ordinary caller still has no management trigger", () => {
    mount(MemberRole.Caller);
    expect(screen.queryByRole("button", { name: "Manage owned-target@example.test" })).not.toBeInTheDocument();
  });
  test("ordinary member cannot use the platform owner recovery controls", async () => {
    const user = userEvent.setup();
    mount(MemberRole.Member);
    await user.click(screen.getByRole("button", { name: "Manage owned-target@example.test" }));
    expect(screen.queryByRole("combobox", { name: "Workspace Role" })).not.toBeInTheDocument();
    expect(screen.getByText("You do not have permission to edit this user")).toBeVisible();
  });
  test("ordinary owner retains the product transfer control and role list", async () => {
    const user = userEvent.setup();
    mount(MemberRole.Owner);
    await user.click(screen.getByRole("button", { name: "Manage owned-target@example.test" }));
    const roles = screen.getByRole("combobox", { name: "Workspace Role" });
    await user.selectOptions(roles, "admin");
    expect(roles).toHaveValue("admin");
    expect(roles.querySelector('option[value="owner"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Transfer Workspace Ownership" })).toBeVisible();
  });
});
