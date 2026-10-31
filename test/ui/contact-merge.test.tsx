import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createMemoryRouter, redirect, RouterProvider } from "react-router";
import { afterAll, afterEach, expect, test, vi } from "vitest";
import ContactScreen from "@/routes/workspaces+/$id/contacts/$contactId.route";
import { saved, audiences } from "./_helpers/contact-editor";

vi.hoisted(() =>
  vi.stubEnv(
    "DATABASE_URL",
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test",
  ),
);
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
vi.mock("sonner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("sonner")>()),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
afterAll(() => vi.unstubAllEnvs());
let router: ReturnType<typeof createMemoryRouter>;
afterEach(() => {
  cleanup();
  router?.dispose();
});

const candidates = [
  saved,
  {
    ...saved,
    id: 6,
    firstname: "Imported",
    other_data: [{ notes: "Source value" }],
    opt_out: true,
  },
];
const version = "a".repeat(64),
  requestId = "c0ab0a09-e55f-49d0-bdee-1fe9c4621494";
async function page(options: { refuse?: boolean; caller?: boolean } = {}) {
  const submissions: Array<{ id: string | undefined; fields: FormData }> = [];
  let merged = false;
  router = createMemoryRouter(
    [
      {
        path: "/workspaces/:id/contacts/:contactId",
        Component: ContactScreen,
        loader: ({ params }) => ({
          contact: candidates.find(
            (row) => String(row.id) === params.contactId,
          ),
          workspace_id: params.id,
          selected_id: params.contactId,
          audiences,
          userRole: options.caller ? "caller" : "member",
          mergeCandidates: merged ? [] : candidates,
          mergeResult: merged
            ? { retainedContactId: 6, mergedCount: 1, requestId }
            : undefined,
        }),
        action: async ({ request, params }) => {
          const fields = await request.formData();
          submissions.push({ id: params.contactId, fields });
          if (fields.get("intent") === "preview-contact-merge")
            return {
              mergeReview: {
                contacts: candidates,
                retainedContactId: Number(params.contactId),
                optedOut: true,
                conflictingFields: ["firstname", "other_data"],
                version,
                requestId,
                effects: {
                  audiences: 2,
                  queues: 2,
                  calls: 1,
                  messages: 1,
                  outreachAttempts: 1,
                  surveyResponses: 1,
                  importReceipts: 0,
                  continuations: 0,
                },
              },
            };
          if (options.refuse)
            return {
              error:
                "These contacts changed after your review. Review them again before merging.",
            };
          merged = true;
          return redirect(
            `/workspaces/owned-workspace/contacts/${params.contactId}?merge_receipt=${requestId}`,
            303,
          );
        },
      },
    ],
    { initialEntries: ["/workspaces/owned-workspace/contacts/5"] },
  );
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Edit Contact" });
  return submissions;
}
async function review() {
  fireEvent.click(
    screen.getByRole("button", { name: "Review duplicate records" }),
  );
  expect(
    screen.getByRole("button", { name: "Review merge", exact: true }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Include Original Name (#5)" }),
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Include Imported Name (#6)" }),
  );
  fireEvent.click(screen.getByRole("radio", { name: "Keep profile #6" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Review merge", exact: true }),
  );
  await screen.findByRole("button", { name: "Confirm merge" });
}
test("the real contact route reviews an explicit selection, confirms it and opens the chosen profile result", async () => {
  const submissions = await page();
  await review();
  expect(submissions).toHaveLength(1);
  expect(submissions[0].id).toBe("6");
  expect(
    JSON.parse(String(submissions[0].fields.get("merge_contact_ids"))),
  ).toEqual([5, 6]);
  expect(
    screen.getByText("The merged contact will stay opted out.", {
      exact: false,
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByText('{"notes":"Source value"}', { exact: false }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirm merge" })).toBeDisabled();
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "I checked these records. They are the same person.",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm merge" }));
  expect(
    await screen.findByRole("heading", { name: "Contact merge complete" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Merged 1 duplicate record",
  );
  expect(
    screen.getByRole("link", { name: "Open retained contact" }),
  ).toHaveAttribute("href", "/workspaces/owned-workspace/contacts/6");
  expect(submissions[1].fields.get("merge_version")).toBe(version);
  expect(submissions[1].fields.get("merge_request_id")).toBe(requestId);
  expect(submissions[1].fields.get("confirm_same_person")).toBe("yes");
  expect(router.state.location.pathname).toBe(
    "/workspaces/owned-workspace/contacts/6",
  );
});
test("a stale review gives a recovery action and does not show a false success", async () => {
  await page({ refuse: true });
  await review();
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "I checked these records. They are the same person.",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm merge" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Review them again"),
  );
  expect(
    screen.queryByRole("button", { name: "Confirm merge" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Review merge", exact: true }),
  ).toBeEnabled();
});
test("changing the selection invalidates the displayed review", async () => {
  await page();
  await review();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Include Imported Name (#6)" }),
  );
  expect(
    screen.queryByRole("button", { name: "Confirm merge" }),
  ).not.toBeInTheDocument();
});
test("callers do not get a merge control", async () => {
  await page({ caller: true });
  expect(
    screen.queryByRole("button", { name: "Review duplicate records" }),
  ).not.toBeInTheDocument();
});
