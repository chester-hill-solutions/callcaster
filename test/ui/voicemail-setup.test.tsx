import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(
  "../../app/routes/workspaces+/$id/voicemails/setup.loader.server",
  () => ({ loader: vi.fn() }),
);
vi.mock(
  "../../app/routes/workspaces+/$id/voicemails/setup.action.server",
  () => ({ action: vi.fn() }),
);

type LoaderData = {
  numbers: Array<{
    id: number;
    phone_number: string | null;
    friendly_name: string | null;
    inbound_audio: string | null;
    currentRouting: string | null;
    routingWouldChange: boolean;
  }>;
  members: Array<{ id: string; email: string; name: string }>;
  greetings: Array<{ id: number | string; name: string; signed_url: string | null }>;
  error: string | null;
};

const defaultData: LoaderData = {
  numbers: [
    {
      id: 1,
      phone_number: "+15551234567",
      friendly_name: "Main line",
      inbound_audio: null,
      currentRouting: null,
      routingWouldChange: true,
    },
    {
      id: 2,
      phone_number: "+15557654321",
      friendly_name: "Support line",
      inbound_audio: "old-greeting.mp3",
      currentRouting: "Forwards calls to +15550009999",
      routingWouldChange: true,
    },
  ],
  members: [
    { id: "u1", email: "owner@example.test", name: "Dana Reed" },
    { id: "u2", email: "admin@example.test", name: "Sam Cole" },
  ],
  greetings: [
    { id: "a1", name: "welcome.mp3", signed_url: "https://example.test/welcome.mp3" },
  ],
  error: null,
};

async function renderSetup(
  data: Partial<LoaderData> = {},
  action?: (args: { request: Request }) => unknown,
) {
  const SetupPage = (
    await import("../../app/routes/workspaces+/$id/voicemails/setup.route")
  ).default;

  const router = createMemoryRouter(
    [
      {
        path: "/workspaces/:id/voicemails/setup",
        element: <SetupPage />,
        loader: () => ({ ...defaultData, ...data }),
        action: action ?? (() => null),
      },
    ],
    { initialEntries: ["/workspaces/ws-1/voicemails/setup"] },
  );

  render(<RouterProvider router={router} />);
  await screen.findByText("Set up voicemail");
  return router;
}

describe("app/routes/workspaces+/$id/voicemails/setup.route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("submits the chosen existing greeting and the selected number ids", async () => {
    const user = userEvent.setup();
    let submitted: FormData | null = null;
    await renderSetup({}, async ({ request }) => {
      submitted = await request.formData();
      return null;
    });

    await user.click(screen.getByRole("radio", { name: /welcome\.mp3/i }));
    await user.click(screen.getByRole("checkbox", { name: /Main line/i }));
    await user.selectOptions(
      screen.getByLabelText(/Who should get the voicemails/i),
      "owner@example.test",
    );
    await user.click(screen.getByRole("button", { name: /Save voicemail setup/i }));

    await waitFor(() => expect(submitted).not.toBeNull());
    const form = submitted as unknown as FormData;
    expect(form.get("greeting-source")).toBe("existing");
    expect(form.get("existing-greeting")).toBe("welcome.mp3");
    expect(form.getAll("numberIds")).toEqual(["1"]);
    // The greeting is inert unless a recipient rides along with it.
    expect(form.get("notify-email")).toBe("owner@example.test");
  });

  test("warns that enabling voicemail replaces existing call forwarding", async () => {
    await renderSetup();
    expect(
      screen.getByText(/Forwards calls to \+15550009999 — voicemail will replace this/i),
    ).toBeInTheDocument();
  });

  test("submits every checked number so one greeting can cover several lines", async () => {
    const user = userEvent.setup();
    let submitted: FormData | null = null;
    await renderSetup({}, async ({ request }) => {
      submitted = await request.formData();
      return null;
    });

    await user.click(screen.getByRole("radio", { name: /welcome\.mp3/i }));
    await user.click(screen.getByRole("checkbox", { name: /Main line/i }));
    await user.click(screen.getByRole("checkbox", { name: /Support line/i }));
    await user.click(screen.getByRole("button", { name: /Save voicemail setup/i }));

    await waitFor(() => expect(submitted).not.toBeNull());
    expect((submitted as unknown as FormData).getAll("numberIds")).toEqual(["1", "2"]);
  });

  test("shows which numbers already have a greeting", async () => {
    await renderSetup();
    expect(screen.getByText(/Currently plays old-greeting\.mp3/i)).toBeInTheDocument();
    expect(screen.getByText(/No greeting yet/i)).toBeInTheDocument();
  });

  test("defaults to uploading when the workspace has no audio yet", async () => {
    await renderSetup({ greetings: [] });
    expect(screen.getByRole("radio", { name: /Upload a new greeting/i })).toBeChecked();
    expect(screen.getByLabelText(/Greeting name/i)).toBeInTheDocument();
  });

  test("points at number setup instead of a dead form when there are no numbers", async () => {
    await renderSetup({ numbers: [] });
    expect(
      screen.queryByRole("button", { name: /Save voicemail setup/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Add a phone number/i }),
    ).toBeInTheDocument();
  });
});
