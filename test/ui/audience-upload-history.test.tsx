import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    outletContext: { supabase: null as any },
    realtimeOpts: null as any,
    formatDistanceToNow: vi.fn(() => "2 minutes ago"),
    logger: { error: vi.fn() },
  };
});

vi.mock("@remix-run/react", () => ({
  useOutletContext: () => mocks.outletContext,
}));

vi.mock("date-fns", () => ({
  formatDistanceToNow: (...args: any[]) => mocks.formatDistanceToNow(...args),
}));

vi.mock("@/hooks/realtime/useSupabaseRealtime", () => ({
  useSupabaseRealtimeSubscription: (opts: any) => {
    mocks.realtimeOpts = opts;
    return undefined;
  },
}));

vi.mock("@/lib/logger.client", () => ({ logger: mocks.logger }));

vi.mock("lucide-react", () => ({
  Loader2: (props: any) => <div {...props}>loader</div>,
}));

function makeSupabase(returnValue: { data: any; error: any } | (() => Promise<{ data: any; error: any }>)) {
  const order = vi.fn(async () => {
    if (typeof returnValue === "function") return await returnValue();
    return returnValue;
  });

  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order,
  };

  return {
    from: vi.fn(() => chain),
    __order: order,
    __chain: chain,
  };
}

describe("app/components/audience/AudienceUploadHistory.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.realtimeOpts = null;
    mocks.formatDistanceToNow.mockClear();
    mocks.logger.error.mockReset();
  });

  test("shows loading, then renders uploads with status/size/progress and file name fallback", async () => {
    const { default: AudienceUploadHistory } = await import("@/components/audience/AudienceUploadHistory");

    const supabase = makeSupabase({
      data: [
        {
          id: 1,
          audience_id: 99,
          created_at: new Date().toISOString(),
          status: "processing",
          file_name: null,
          file_size: 1024,
          total_contacts: 10,
          processed_contacts: 4,
          processed_at: null,
          error_message: null,
        },
        {
          id: 6,
          audience_id: 99,
          created_at: new Date().toISOString(),
          status: "processing",
          file_name: "zero.csv",
          file_size: 0,
          total_contacts: 0,
          processed_contacts: 0,
          processed_at: null,
          error_message: null,
        },
        {
          id: 2,
          audience_id: 99,
          created_at: new Date().toISOString(),
          status: "completed",
          file_name: "ok.csv",
          file_size: null,
          total_contacts: 5,
          processed_contacts: 5,
          processed_at: new Date().toISOString(),
          error_message: null,
        },
        {
          id: 3,
          audience_id: 99,
          created_at: new Date().toISOString(),
          status: "error",
          file_name: "bad.csv",
          file_size: 0,
          total_contacts: 0,
          processed_contacts: 0,
          processed_at: null,
          error_message: "boom",
        },
        {
          id: 4,
          audience_id: 99,
          created_at: new Date().toISOString(),
          status: "pending",
          file_name: "p.csv",
          file_size: 1024 * 1024,
          total_contacts: 1,
          processed_contacts: 0,
          processed_at: null,
          error_message: null,
        },
        {
          id: 5,
          audience_id: 99,
          created_at: new Date().toISOString(),
          status: "unknown",
          file_name: "u.csv",
          file_size: 1024 * 1024 * 1024,
          total_contacts: 1,
          processed_contacts: 0,
          processed_at: null,
          error_message: null,
        },
      ],
      error: null,
    });
    mocks.outletContext.supabase = supabase;

    render(<AudienceUploadHistory audienceId={99} />);
    expect(screen.getByText("Loading upload history...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("ok.csv")).toBeInTheDocument();
    });

    expect(screen.getByText("Unknown file")).toBeInTheDocument();
    expect(screen.getByText("1.0 KB")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("1.0 MB")).toBeInTheDocument();
    expect(screen.getByText("1.0 GB")).toBeInTheDocument();

    // processing shows progress bar with rounded percentage (4/10 = 40%)
    const processingRow = screen.getByText("Unknown file").closest("tr") as HTMLElement;
    const progressInner = processingRow.querySelector("div[style]") as HTMLElement;
    expect(progressInner.getAttribute("style")).toContain("40%");

    // processing with total_contacts=0 yields 0%
    const zeroRow = screen.getByText("zero.csv").closest("tr") as HTMLElement;
    const zeroProgress = zeroRow.querySelector("div[style]") as HTMLElement;
    expect(zeroProgress.getAttribute("style")).toContain("0%");

    // completed uses total_contacts as plain number
    const completedRow = screen.getByText("completed").closest("tr") as HTMLElement;
    expect(within(completedRow).getByText("5")).toBeInTheDocument();

    // error shows warning icon with title
    const errorRow = screen.getByText("error").closest("tr") as HTMLElement;
    const warn = within(errorRow).getByTitle("boom");
    expect(warn).toBeInTheDocument();

    // status badge class switch (spot check)
    expect(screen.getByText("pending").className).toContain("bg-yellow-100");
    expect(screen.getAllByText("processing")[0]!.className).toContain("bg-blue-100");
    expect(screen.getByText("completed").className).toContain("bg-green-100");
    expect(screen.getByText("error").className).toContain("bg-red-100");
    expect(screen.getByText("unknown").className).toContain("bg-gray-100");
  });

  test("renders empty state when no uploads", async () => {
    const { default: AudienceUploadHistory } = await import("@/components/audience/AudienceUploadHistory");
    mocks.outletContext.supabase = makeSupabase({ data: [], error: null });

    render(<AudienceUploadHistory audienceId={1} />);
    await waitFor(() => {
      expect(screen.getByText("No upload history found for this audience")).toBeInTheDocument();
    });
  });

  test("null data falls back to empty uploads list", async () => {
    const { default: AudienceUploadHistory } = await import("@/components/audience/AudienceUploadHistory");
    mocks.outletContext.supabase = makeSupabase({ data: null, error: null });

    render(<AudienceUploadHistory audienceId={1} />);
    await waitFor(() => {
      expect(screen.getByText("No upload history found for this audience")).toBeInTheDocument();
    });
  });

  test("renders error state and Try again refetches successfully", async () => {
    const { default: AudienceUploadHistory } = await import("@/components/audience/AudienceUploadHistory");
    let call = 0;
    const supabase = makeSupabase(async () => {
      call++;
      if (call === 1) {
        return { data: null, error: new Error("nope") };
      }
      return {
        data: [
          {
            id: 1,
            audience_id: 1,
            created_at: new Date().toISOString(),
            status: "completed",
            file_name: "x.csv",
            file_size: 1,
            total_contacts: 1,
            processed_contacts: 1,
            processed_at: null,
            error_message: null,
          },
        ],
        error: null,
      };
    });
    mocks.outletContext.supabase = supabase;

    render(<AudienceUploadHistory audienceId={1} />);

    await waitFor(() => {
      expect(screen.getByText("Error loading upload history")).toBeInTheDocument();
    });
    expect(screen.getByText("nope")).toBeInTheDocument();
    expect(mocks.logger.error).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(screen.getByText("x.csv")).toBeInTheDocument();
    });
  });

  test("non-Error thrown during fetch shows generic error message", async () => {
    const { default: AudienceUploadHistory } = await import("@/components/audience/AudienceUploadHistory");
    const supabase = makeSupabase({ data: null, error: "nope" as any });
    mocks.outletContext.supabase = supabase;

    render(<AudienceUploadHistory audienceId={1} />);
    await waitFor(() => {
      expect(screen.getByText("Error loading upload history")).toBeInTheDocument();
    });
    expect(screen.getByText("An error occurred while fetching uploads")).toBeInTheDocument();
  });

  test("realtime subscription INSERT/UPDATE/DELETE mutate uploads without refetch", async () => {
    const { default: AudienceUploadHistory } = await import("@/components/audience/AudienceUploadHistory");
    mocks.outletContext.supabase = makeSupabase({
      data: [
        {
          id: 1,
          audience_id: 1,
          created_at: new Date().toISOString(),
          status: "pending",
          file_name: "a.csv",
          file_size: 1,
          total_contacts: 2,
          processed_contacts: 0,
          processed_at: null,
          error_message: null,
        },
      ],
      error: null,
    });

    render(<AudienceUploadHistory audienceId={1} />);
    await waitFor(() => expect(screen.getByText("a.csv")).toBeInTheDocument());
    expect(mocks.realtimeOpts?.table).toBe("audience_upload");

    // INSERT
    await act(async () => {
      mocks.realtimeOpts.onChange({
        eventType: "INSERT",
        new: {
          id: 2,
          audience_id: 1,
          created_at: new Date().toISOString(),
          status: "completed",
          file_name: "b.csv",
          file_size: 1,
          total_contacts: 1,
          processed_contacts: 1,
          processed_at: null,
          error_message: null,
        },
      });
    });
    await waitFor(() => expect(screen.getByText("b.csv")).toBeInTheDocument());

    // UPDATE merges by id
    await act(async () => {
      mocks.realtimeOpts.onChange({
        eventType: "UPDATE",
        new: { id: 2, status: "error", error_message: "e" },
      });
    });
    await waitFor(() => expect(screen.getByText("error")).toBeInTheDocument());
    expect(screen.getByTitle("e")).toBeInTheDocument();

    // UPDATE with non-matching id should be a no-op (covers upload.id !== newData.id branch)
    await act(async () => {
      mocks.realtimeOpts.onChange({
        eventType: "UPDATE",
        new: { id: 999, status: "completed" },
      });
    });
    expect(screen.getByText("a.csv")).toBeInTheDocument();

    // UPDATE with no id should be a no-op (covers newData.id falsy branch)
    await act(async () => {
      mocks.realtimeOpts.onChange({
        eventType: "UPDATE",
        new: { status: "completed" },
      });
    });
    expect(screen.getByText("a.csv")).toBeInTheDocument();

    // DELETE removes by id
    await act(async () => {
      mocks.realtimeOpts.onChange({
        eventType: "DELETE",
        old: { id: 2 },
      });
    });
    await waitFor(() => expect(screen.queryByText("b.csv")).toBeNull());

    // DELETE with no id should not remove existing rows (covers old.id undefined path)
    await act(async () => {
      mocks.realtimeOpts.onChange({
        eventType: "DELETE",
        old: {},
      });
    });
    expect(screen.getByText("a.csv")).toBeInTheDocument();

    // Unknown eventType should be ignored (covers DELETE condition false branch)
    await act(async () => {
      mocks.realtimeOpts.onChange({
        eventType: "UNKNOWN",
        new: { id: 1 },
        old: { id: 1 },
      });
    });
    expect(screen.getByText("a.csv")).toBeInTheDocument();
  });

  test("audienceId=0 short-circuits fetch and remains loading", async () => {
    const { default: AudienceUploadHistory } = await import("@/components/audience/AudienceUploadHistory");
    const supabase = makeSupabase({ data: [], error: null });
    mocks.outletContext.supabase = supabase;

    render(<AudienceUploadHistory audienceId={0} />);
    expect(screen.getByText("Loading upload history...")).toBeInTheDocument();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

