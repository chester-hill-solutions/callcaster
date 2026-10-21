import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { MessageSettings } from "@/components/campaign/settings/MessageSettings";
import ScriptEditor from "../../app/routes/workspaces+/$id/campaigns/$selected_id/script/edit.route";
import type { ScriptEditLoaderData } from "../../app/routes/workspaces+/$id/campaigns/$selected_id/script/edit.types";

vi.mock(
  "../../app/routes/workspaces+/$id/campaigns/$selected_id/script/edit.loader.server",
  () => ({ loader: vi.fn() }),
);
vi.mock(
  "../../app/routes/workspaces+/$id/campaigns/$selected_id/script/edit.action.server",
  () => ({ action: vi.fn() }),
);

const routers = new Set<ReturnType<typeof createMemoryRouter>>();
const details = {
  workspace: "workspace-one",
  campaign_id: 121,
  message_media: [],
};

afterEach(() => {
  for (const router of routers) router.dispose();
  routers.clear();
  vi.restoreAllMocks();
});

function ControlledMessage({
  initialBody,
  onChange,
}: {
  initialBody: string;
  onChange: (field: string, value: unknown) => void;
}) {
  const [body, setBody] = useState(initialBody);
  return (
    <MessageSettings
      mediaLinks={[]}
      details={{ ...details, body_text: body }}
      onChange={(field, value) => {
        if (field === "body_text" && typeof value === "string") setBody(value);
        onChange(field, value);
      }}
    />
  );
}

function renderEditor(initialBody: string, onChange = vi.fn()) {
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <ControlledMessage initialBody={initialBody} onChange={onChange} />
      ),
    },
  ]);
  routers.add(router);
  return { ...render(<RouterProvider router={router} />), onChange };
}

describe("campaign message field accessibility (#2652)", () => {
  test("has a visible label and stable connections to personalization help and count status", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor("Hello");
    const field = screen.getByRole("textbox", {
      name: "Your Campaign Message",
    });
    const label = screen.getByText("Your Campaign Message");
    expect(label).toBeVisible();
    expect(label).toHaveAttribute("for", field.id);
    expect(field).toHaveAttribute("name", "body_text");
    expect(field).toHaveAccessibleDescription(
      /Personalize with tags like \{\{firstname\}\}\s*\. Browse tags/,
    );
    expect(field).toHaveAccessibleDescription(/1 segment \(GSM-7\)/);

    await user.click(label);
    expect(field).toHaveFocus();
    const fieldId = field.id;
    const describedBy = field.getAttribute("aria-describedby");
    fireEvent.change(field, { target: { value: "Hello again" } });
    expect(onChange).toHaveBeenLastCalledWith("body_text", "Hello again");
    expect(field).toHaveAttribute("id", fieldId);
    expect(field).toHaveAttribute("aria-describedby", describedBy);
    expect(field).toHaveAccessibleDescription(/11 visible characters/);
  });

  test("assigns distinct label targets to separate editor instances", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <>
            <ControlledMessage initialBody="First" onChange={vi.fn()} />
            <ControlledMessage initialBody="Second" onChange={vi.fn()} />
          </>
        ),
      },
    ]);
    routers.add(router);
    render(<RouterProvider router={router} />);
    const fields = screen.getAllByRole("textbox", {
      name: "Your Campaign Message",
    });
    expect(fields).toHaveLength(2);
    expect(new Set(fields.map((field) => field.id)).size).toBe(2);
    expect(fields.map((field) => field.id)).not.toContain("");
    expect(
      screen
        .getAllByText("Your Campaign Message")
        .map((label) => label.getAttribute("for")),
    ).toEqual(fields.map((field) => field.id));
  });

  test("connects updated Unicode feedback and preserves the sample-contact preview", () => {
    renderEditor("🔥".repeat(71));
    const field = screen.getByRole("textbox");
    expect(field).toHaveAccessibleDescription(/8 \/ 67 characters used/);
    expect(field).toHaveAccessibleDescription(/3 segments \(UCS-2\)/);
    expect(field).toHaveAccessibleDescription(/71 visible characters/);
    expect(field).toHaveAccessibleDescription(/≈ 6 credits per recipient/);

    fireEvent.change(field, { target: { value: "Hi {{firstname}}" } });
    expect(screen.getByTestId("template-preview")).toHaveTextContent(
      "Hi Jordan",
    );
    expect(field).toHaveAccessibleDescription(/1 segment \(GSM-7\)/);
  });
});

describe("campaign message draft controls (#2652)", () => {
  test.each([
    {
      choice: /First Name/,
      inserted: "{{firstname}}",
      expected: "Hi {{firstname}}!",
    },
    {
      choice: /Base64 encode phone and external ID/,
      inserted: "btoa({{phone}}:{{external_id}})",
      expected: "Hi btoa({{phone}}:{{external_id}})!",
    },
  ])(
    "replaces a selected range with $inserted and restores the native caret",
    async ({ choice, inserted, expected }) => {
      const user = userEvent.setup();
      const { onChange } = renderEditor("Hi NAME!");
      const field = screen.getByRole<HTMLTextAreaElement>("textbox");
      act(() => {
        field.focus();
        field.setSelectionRange(3, 7);
      });
      await user.click(
        screen.getByRole("button", { name: "Insert template tags" }),
      );
      await user.click(screen.getByRole("button", { name: choice }));
      expect(field).toHaveValue(expected);
      expect(onChange).toHaveBeenLastCalledWith("body_text", expected);
      await waitFor(() => {
        expect(field.selectionStart).toBe(3 + inserted.length);
        expect(field.selectionEnd).toBe(3 + inserted.length);
      });
      expect(screen.queryByText("Template Tags")).not.toBeInTheDocument();
    },
  );

  test("the real Content route saves and discards edits without replacing the field", async () => {
    const user = userEvent.setup();
    const savedBody = "Saved message";
    const nextBody = "Hi {{firstname}} 🔥";
    const loaderData: ScriptEditLoaderData = {
      workspace_id: "workspace-one",
      selected_id: "121",
      data: {
        id: 121,
        type: "message",
        campaignDetails: {
          ...details,
          created_at: "2026-10-15T00:00:00Z",
          id: 121,
          script_id: null,
          body_text: savedBody,
        },
      },
      mediaNames: [],
      userRole: "owner",
      scripts: [],
    };
    const fetchSave = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const router = createMemoryRouter(
      [
        {
          path: "/workspaces/:id/campaigns/:selected_id/script/edit",
          Component: ScriptEditor,
          HydrateFallback: () => null,
          loader: () => loaderData,
        },
      ],
      {
        initialEntries: ["/workspaces/workspace-one/campaigns/121/script/edit"],
      },
    );
    routers.add(router);
    render(<RouterProvider router={router} />);
    const field = await screen.findByRole("textbox");

    fireEvent.change(field, { target: { value: "Discard this draft" } });
    await user.click(
      await screen.findByRole("button", { name: "Discard changes" }),
    );
    expect(field).toHaveValue(savedBody);
    expect(fetchSave).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: nextBody } });
    expect(screen.getByTestId("template-preview")).toHaveTextContent(
      "Hi Jordan 🔥",
    );
    await user.click(
      await screen.findByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Save changes" }),
      ).not.toBeInTheDocument(),
    );
    expect(fetchSave).toHaveBeenCalledTimes(1);
    const save = fetchSave.mock.calls.at(0);
    expect(save?.[0]).toBe("/api/campaigns");
    expect(save?.[1]?.method).toBe("PATCH");
    const formData = save?.[1]?.body;
    if (!(formData instanceof FormData))
      throw new Error("Expected the campaign save form");
    const campaignData = JSON.parse(String(formData.get("campaignData")));
    expect(campaignData.body_text).toBe(nextBody);
    expect(campaignData.campaignDetails.body_text).toBe(nextBody);
    expect(JSON.parse(String(formData.get("campaignDetails"))).body_text).toBe(
      nextBody,
    );
    expect(formData.get("saveScriptAsCopy")).toBe("false");

    fireEvent.change(field, { target: { value: "Another draft" } });
    await user.click(
      await screen.findByRole("button", { name: "Discard changes" }),
    );
    expect(field).toHaveValue(nextBody);
    expect(screen.getByRole("textbox")).toBe(field);
    expect(fetchSave).toHaveBeenCalledTimes(1);
  });
});
