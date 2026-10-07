import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterAll, describe, expect, test, vi } from "vitest";
import ContactScreen from "@/routes/workspaces+/$id/contacts/$contactId.route";
import { saved, audiences } from "./_helpers/contact-editor";

vi.hoisted(() => {
  vi.stubEnv(
    "DATABASE_URL",
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test",
  );
});
afterAll(() => vi.unstubAllEnvs());

vi.mock(
  "@/routes/workspaces+/$id/contacts/$contactId.action.server",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/routes/workspaces+/$id/contacts/$contactId.action.server")
    >()),
    action: vi.fn(),
  }),
);
vi.mock(
  "@/routes/workspaces+/$id/contacts/$contactId.loader.server",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/routes/workspaces+/$id/contacts/$contactId.loader.server")
    >()),
    loader: vi.fn(),
  }),
);
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/logger.client", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

async function page(
  options: { delayed?: boolean; initial?: string; refuse?: boolean } = {},
) {
  const rows = new Map([
    ["5", saved],
    [
      "6",
      {
        ...saved,
        id: 6,
        firstname: "Second",
        other_data: [],
        contact_audience: [],
      },
    ],
  ]);
  const submissions: FormData[] = [];
  let finish: (() => void) | undefined;
  const pending = options.delayed
    ? new Promise<void>((resolve) => {
        finish = resolve;
      })
    : Promise.resolve();
  const router = createMemoryRouter(
    [
      {
        path: "/workspaces/:id/contacts/:contactId",
        Component: ContactScreen,
        loader: ({ params }) => ({
          contact: rows.get(params.contactId ?? "") ?? null,
          selected_id: params.contactId,
          workspace_id: params.id,
          userRole: "member",
          audiences,
        }),
        action: async ({ request, params }) => {
          const values = await request.formData();
          submissions.push(values);
          await pending;
          if (options.refuse) return { error: "Owned refusal" };
          const id = params.contactId === "new" ? "7" : params.contactId!;
          const next = {
            ...saved,
            id: Number(id),
            firstname: String(values.get("firstname")),
            date_updated: "2026-10-07T07:01:00Z",
            other_data: JSON.parse(
              String(
                values.get("other_data") ?? JSON.stringify(saved.other_data),
              ),
            ),
            contact_audience: JSON.parse(
              String(
                values.get("audience_ids") ??
                  JSON.stringify(
                    saved.contact_audience.map((row) => row?.audience_id),
                  ),
              ),
            ).map((audience_id: number) => ({
              audience_id,
              contact_id: Number(id),
              created_at: "2026-10-07",
            })),
          };
          rows.set(id, next);
          return {
            success: true,
            created: params.contactId === "new",
            contact: next,
          };
        },
      },
    ],
    {
      initialEntries: [
        `/workspaces/owned-workspace/contacts/${options.initial ?? "5"}`,
      ],
    },
  );
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", {
    name: options.initial === "new" ? "New Contact" : "Edit Contact",
  });
  if (options.initial !== "new")
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  return { router, submissions, finish: () => finish?.() };
}
async function saveButton() {
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
}

describe("contact route single Save and draft identity (#2127)", () => {
  test("the real header Save submits text, lists and Other Data then clears saved edits", async () => {
    const { submissions } = await page();
    fireEvent.change(screen.getByPlaceholderText("Enter first name"), {
      target: { value: "Jane" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "List 2" }));
    fireEvent.change(screen.getByRole("textbox", { name: "notes" }), {
      target: { value: "Updated" },
    });
    await saveButton();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save", exact: true }),
      ).toBeDisabled(),
    );
    expect(submissions).toHaveLength(1);
    expect(submissions[0].get("firstname")).toBe("Jane");
    expect(JSON.parse(String(submissions[0].get("audience_ids")))).toEqual([
      1, 99, 2,
    ]);
    expect(JSON.parse(String(submissions[0].get("other_data")))).toEqual([
      { notes: "Updated", hidden: { enabled: true, count: 3 } },
      { score: 7 },
      null,
    ]);
    expect(screen.getByPlaceholderText("Enter first name")).toHaveValue("Jane");
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "notes" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Remove notes field" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Field Name" })).toBeInTheDocument();
  });
  test("Save, Reset and edits stay disabled until the actual pending save completes", async () => {
    const { submissions, finish } = await page({ delayed: true });
    fireEvent.click(screen.getByRole("checkbox", { name: "List 2" }));
    await saveButton();
    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
    expect(screen.getByPlaceholderText("Enter first name")).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "List 2" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove notes field" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Field Name" })).toBeDisabled();
    await act(async () => finish());
  });
  test("a refused save retains all edits and permits retry", async () => {
    await page({ refuse: true });
    fireEvent.click(screen.getByRole("checkbox", { name: "List 2" }));
    fireEvent.change(screen.getByRole("textbox", { name: "notes" }), {
      target: { value: "Retain" },
    });
    await saveButton();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save", exact: true }),
      ).toBeEnabled(),
    );
    expect(screen.getByRole("checkbox", { name: "List 2" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "notes" })).toHaveValue(
      "Retain",
    );
  });
  test("navigation to a different contact cannot carry the old draft or dirty flag", async () => {
    const { router } = await page();
    fireEvent.change(screen.getByPlaceholderText("Enter first name"), {
      target: { value: "Do not copy" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "List 2" }));
    await act(async () =>
      router.navigate("/workspaces/owned-workspace/contacts/6"),
    );
    expect(screen.getByPlaceholderText("Enter first name")).toHaveValue(
      "Second",
    );
    expect(screen.getByRole("checkbox", { name: "List 2" })).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Save", exact: true }),
    ).toBeDisabled();
  });
  test("a late save response cannot reset edits for the next contact", async () => {
    const { router, finish, submissions } = await page({ delayed: true });
    fireEvent.change(screen.getByPlaceholderText("Enter first name"), {
      target: { value: "Saved first" },
    });
    await saveButton();
    await waitFor(() => expect(submissions).toHaveLength(1));
    await act(async () =>
      router.navigate("/workspaces/owned-workspace/contacts/6"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByPlaceholderText("Enter first name"), {
      target: { value: "Next draft" },
    });
    await act(async () => finish());
    expect(screen.getByPlaceholderText("Enter first name")).toHaveValue(
      "Next draft",
    );
    expect(
      screen.getByRole("button", { name: "Save", exact: true }),
    ).toBeEnabled();
  });
  test("a newly saved contact opens its saved identity rather than creating it again", async () => {
    const { router, submissions } = await page({ initial: "new" });
    fireEvent.change(screen.getByPlaceholderText("Enter first name"), {
      target: { value: "New saved" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "List 2" }));
    await saveButton();
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        "/workspaces/owned-workspace/contacts/7",
      ),
    );
    expect(submissions).toHaveLength(1);
    expect(screen.getByPlaceholderText("Enter first name")).toHaveValue(
      "New saved",
    );
    expect(screen.getByRole("checkbox", { name: "List 2" })).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Save", exact: true }),
    ).toBeDisabled();
  });
});
