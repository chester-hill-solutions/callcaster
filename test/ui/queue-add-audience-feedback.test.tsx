import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * #1472: "Add from Audience" was silent whenever the link request returned 200
 * with nothing enqueued, and the "Add {name}" button stayed on screen, so users
 * clicked it over and over. These tests drive the queue route end to end
 * through a controllable fetcher and assert the toast plus the picker reset.
 */

// vi.hoisted so the vi.mock factories below (also hoisted) can reference
// these before the static route import at the bottom of the mock block runs.
const { fetcher, toast, queueValue } = vi.hoisted(() => ({
  fetcher: {
    submit: vi.fn(),
    load: vi.fn(),
    state: "idle" as "idle" | "submitting" | "loading",
    data: undefined as unknown,
    Form: ({ children, ...p }: any) => React.createElement("form", p, children),
  },
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  queueValue: {
    queueData: [],
    queueError: null,
    totalCount: 0,
    unfilteredCount: 0,
    queuedCount: 0,
    currentPage: 1,
    pageSize: 25,
    filters: {
      name: "",
      phone: "",
      email: "",
      address: "",
      audiences: "",
      disposition: "",
      queueStatus: "",
    },
  },
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useFetcher: () => fetcher,
    useNavigation: () => ({ state: "idle" }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLoaderData: () => ({
      queuePromise: queueValue,
      campaignId: "7",
      selectedAudienceIds: [],
    }),
    useOutletContext: () => ({
      campaignData: { id: 7, workspace: "ws-1" },
      campaignDetails: {},
      audiences: [{ id: 1, name: "Audience A" }],
    }),
    // The loader hands the route a promise; the test hands it the resolved
    // value so the picker renders synchronously.
    Await: ({ resolve, children }: any) => <>{children(resolve)}</>,
    Form: ({ children, ...p }: any) => <form {...p}>{children}</form>,
  };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("../../app/routes/workspaces+/$id/campaigns/$selected_id/queue.loader.server", () => ({
  loader: vi.fn(),
}));
vi.mock("../../app/routes/workspaces+/$id/campaigns/$selected_id/queue.action.server", () => ({
  action: vi.fn(),
}));
vi.mock("@/components/queue/ContactSearchDialog", () => ({
  ContactSearchDialog: () => null,
}));
vi.mock("@/components/campaign/CampaignPlaceNav", () => ({
  CampaignPlaceNav: () => null,
}));
vi.mock("@/hooks/utils/useOptimisticMutation", () => ({
  useOptimisticMutation: () => undefined,
}));

// Bridge Radix Select to a native <select> so fireEvent.change can pick an
// audience (same bridge as components-queue.test.tsx).
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, disabled, children }: any) => (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: ({ placeholder }: any) => <option value="">{placeholder}</option>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));

// Imported after the mocks above (vi.mock is hoisted) and at file scope so the
// route's dependency graph is transformed once at load, not inside a test's
// 5s budget.
import Queue from "../../app/routes/workspaces+/$id/campaigns/$selected_id/queue.route";

async function renderQueueRoute() {
  const utils = render(<Queue />);
  return { ...utils, rerender: () => utils.rerender(<Queue />) };
}

function getAudiencePicker() {
  // QueueTable also renders <Select> combobox filters; scope to the header
  // picker via its "Select Call list" placeholder option.
  const placeholder = screen.getAllByText("Select Call list").find((el) => el.tagName === "OPTION");
  const select = placeholder?.closest("select");
  if (!select) throw new Error("audience picker <select> not found");
  return select as HTMLSelectElement;
}

function pickAudienceAndSubmit() {
  fireEvent.click(screen.getByRole("button", { name: "Add from Audience" }));
  fireEvent.change(getAudiencePicker(), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Add Audience A" }));
  expect(fetcher.submit).toHaveBeenCalledWith(
    { audience_id: 1, campaign_id: 7 },
    { action: "/api/campaign_audience", method: "POST", encType: "application/json" },
  );
}

function expectPickerReset() {
  expect(screen.getByRole("button", { name: "Add from Audience" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Add Audience A/ })).toBeNull();
}

describe("queue route: Add from Audience feedback (#1472)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetcher.state = "idle";
    fetcher.data = undefined;
  });

  test("warns when the audience links but has no contacts, then resets the picker", async () => {
    const { rerender } = await renderQueueRoute();
    pickAudienceAndSubmit();

    fetcher.data = { success: true, audienceLinked: true, enqueued: 0, skipped: 0 };
    rerender();

    expect(toast.warning).toHaveBeenCalledWith(
      "Audience linked, but it has no contacts to add to the queue.",
    );
    expect(toast.success).not.toHaveBeenCalled();
    expectPickerReset();
  });

  test("warns when every contact was already queued, using the skipped count", async () => {
    const { rerender } = await renderQueueRoute();
    pickAudienceAndSubmit();

    fetcher.data = { success: true, audienceLinked: true, enqueued: 0, skipped: 12 };
    rerender();

    expect(toast.warning).toHaveBeenCalledWith(
      "Audience linked, but all 12 of its contacts were already in the queue. Nothing new was added.",
    );
    expectPickerReset();
  });

  test("warns when the audience is already linked, then resets the picker", async () => {
    const { rerender } = await renderQueueRoute();
    pickAudienceAndSubmit();

    fetcher.data = {
      success: true,
      alreadyLinked: true,
      audienceLinked: true,
      enqueued: 0,
      skipped: 0,
      message: "Audience already added to campaign",
    };
    rerender();

    expect(toast.warning).toHaveBeenCalledWith(
      "This audience is already added to the campaign. Nothing new was queued.",
    );
    expectPickerReset();
  });

  test("toasts the enqueued count on a real success and resets the picker", async () => {
    const { rerender } = await renderQueueRoute();
    pickAudienceAndSubmit();

    fetcher.data = { success: true, audienceLinked: true, enqueued: 3, skipped: 0 };
    rerender();

    expect(toast.success).toHaveBeenCalledWith("Added 3 contacts to the queue");
    expect(toast.warning).not.toHaveBeenCalled();
    expectPickerReset();
  });

  test("disables the Add button while the request is in flight", async () => {
    const { rerender } = await renderQueueRoute();
    pickAudienceAndSubmit();

    fetcher.state = "submitting";
    rerender();

    const adding = screen.getByRole("button", { name: "Adding Audience A..." });
    expect(adding).toBeDisabled();
    fireEvent.click(adding);
    expect(fetcher.submit).toHaveBeenCalledTimes(1);
    expect(toast.warning).not.toHaveBeenCalled();
  });

  test("leaves the picker alone when an unrelated queue action succeeds", async () => {
    const { rerender } = await renderQueueRoute();
    fireEvent.click(screen.getByRole("button", { name: "Add from Audience" }));
    fireEvent.change(getAudiencePicker(), { target: { value: "1" } });

    fetcher.data = { success: true };
    rerender();

    expect(screen.getByRole("button", { name: "Add Audience A" })).toBeTruthy();
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
