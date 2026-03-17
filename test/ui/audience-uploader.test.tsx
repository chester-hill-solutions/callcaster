import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    params: { id: "w1" } as Record<string, string>,
    navigate: vi.fn(),
    fetcher: { state: "idle", data: undefined as any },
    realtimeOpts: null as any,
    interval: {
      cb: null as null | (() => Promise<void> | void),
      ms: null as any,
    },
    logger: { error: vi.fn() },
    onUploadComplete: vi.fn(),
  };
});

vi.mock("@remix-run/react", () => ({
  useParams: () => mocks.params,
  useNavigate: () => mocks.navigate,
  useFetcher: () => mocks.fetcher,
}));

vi.mock("@/hooks/realtime/useSupabaseRealtime", () => ({
  useSupabaseRealtimeSubscription: (opts: any) => {
    mocks.realtimeOpts = opts;
    return undefined;
  },
}));

vi.mock("@/hooks/utils/useInterval", () => ({
  useInterval: (cb: any, ms: any) => {
    mocks.interval.cb = cb;
    mocks.interval.ms = ms;
  },
}));

vi.mock("@/lib/logger.client", () => ({ logger: mocks.logger }));

vi.mock("@/components/ui/button", () => ({
  Button: ({ asChild, children, ...props }: any) => {
    if (asChild) return <>{children}</>;
    return <button {...props}>{children}</button>;
  },
}));
vi.mock("@/components/ui/table", () => ({
  Table: (p: any) => <table {...p} />,
  TableHeader: (p: any) => <thead {...p} />,
  TableBody: (p: any) => <tbody {...p} />,
  TableRow: (p: any) => <tr {...p} />,
  TableHead: (p: any) => <th {...p} />,
  TableCell: (p: any) => <td {...p} />,
}));
vi.mock("@/components/ui/progress", () => ({
  Progress: ({ value }: any) => <div role="progressbar">{String(value)}</div>,
}));
vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: any) => <div>{children}</div>,
  AlertTitle: ({ children }: any) => <div>{children}</div>,
  AlertDescription: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("react-icons/md", () => ({
  MdAdd: () => <span>add</span>,
  MdClose: () => <span>close</span>,
  MdCheck: () => <span>check</span>,
}));

function makeSupabase() {
  return {} as any;
}

function setFetchJsonOnce(data: any, ok = true) {
  (globalThis as any).fetch = vi.fn(async () => {
    return {
      ok,
      async json() {
        return data;
      },
    } as any;
  });
}

describe("app/components/audience/AudienceUploader.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.navigate.mockReset();
    mocks.fetcher.state = "idle";
    mocks.fetcher.data = undefined;
    mocks.realtimeOpts = null;
    mocks.interval.cb = null;
    mocks.interval.ms = null;
    mocks.logger.error.mockReset();
    mocks.onUploadComplete.mockReset();
    vi.useRealTimers();
    (globalThis as any).fetch = undefined;
  });

  test("renders with default audienceName", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    render(<AudienceUploader supabase={makeSupabase()} />);
    expect(
      screen.getByText("Upload contacts (.csv file):"),
    ).toBeInTheDocument();
  });

  test("realtime ignores non-UPDATE events and missing payload.new", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    render(<AudienceUploader supabase={makeSupabase()} audienceName="A1" />);

    await act(async () => {
      mocks.realtimeOpts.onChange({
        eventType: "INSERT",
        new: { status: "completed", id: 1 },
      });
      mocks.realtimeOpts.onChange({ eventType: "UPDATE" });
    });

    expect(screen.queryByText("Completed!")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Start Upload" }),
    ).toBeInTheDocument();
  });

  test("file selection parses CSV, shows mapping table + preview, supports mapping edits + split-name toggle, confirm/reset, and remove file", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const supabase = makeSupabase();

    const { container } = render(
      <AudienceUploader supabase={supabase} audienceName="A1" />,
    );

    const fileInput = container.querySelector(
      'input[type="file"]#contacts',
    ) as HTMLInputElement;
    const csv = ["Name,Phone,Weird", "Alice,123,null", "Bob,,x"].join("\n");
    const file = new File([csv], "contacts.csv", { type: "text/csv" });
    (file as any).text = async () => csv;

    // no file -> no-op
    fireEvent.change(fileInput, { target: { files: [] } });

    // with file
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(screen.getByText("contacts.csv")).toBeInTheDocument();
    expect(screen.getByText("Map CSV Headers")).toBeInTheDocument();

    // splitNameColumn inferred from "Name" header -> options column appears + checkbox checked
    expect(screen.getByText("Options")).toBeInTheDocument();
    const split = screen.getByLabelText(
      "Split into First/Last Name",
    ) as HTMLInputElement;
    expect(split.checked).toBe(true);
    fireEvent.click(split);
    expect(screen.queryByLabelText("Split into First/Last Name")).toBeNull();
    expect(screen.queryByText("Options")).toBeNull();

    // mapping select changes
    const rows = screen.getAllByRole("row");
    const weirdRow = rows.find((r) =>
      (r as HTMLElement).textContent?.includes("weird"),
    ) as HTMLElement;
    const sel = weirdRow.querySelector("select") as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: "city" } });
    expect(sel.value).toBe("city");

    // preview shows first 5 rows and maps null -> empty string
    expect(screen.getByText("Data Preview (First 5 rows)")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getAllByText("").length).toBeGreaterThanOrEqual(1);

    // confirm mapping shows summary
    fireEvent.click(screen.getByRole("button", { name: "Confirm Mapping" }));
    expect(screen.getByText(/contacts ready to upload/)).toBeInTheDocument();

    // reset mapping returns to mapping table
    fireEvent.click(screen.getByRole("button", { name: "Reset Mapping" }));
    expect(screen.getByText("CSV Header")).toBeInTheDocument();

    // remove file clears filename and input value
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(screen.queryByText("contacts.csv")).toBeNull();
    expect(fileInput.value).toBe("");
  });

  test("file selection infers split from 'Full Name' header", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const supabase = makeSupabase();

    const { container } = render(
      <AudienceUploader supabase={supabase} audienceName="A1" />,
    );

    const fileInput = container.querySelector(
      'input[type="file"]#contacts',
    ) as HTMLInputElement;
    const csv = ["Full Name,Phone", "Alice A,123"].join("\n");
    const file = new File([csv], "contacts.csv", { type: "text/csv" });
    (file as any).text = async () => csv;

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(screen.getByText("Options")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Split into First/Last Name"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("full name").length).toBeGreaterThanOrEqual(1);
  });

  test("file selection with empty file contents is a no-op", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const supabase = makeSupabase();

    const { container } = render(
      <AudienceUploader supabase={supabase} audienceName="A1" />,
    );

    const fileInput = container.querySelector(
      'input[type="file"]#contacts',
    ) as HTMLInputElement;
    const file = new File([""], "empty.csv", { type: "text/csv" });
    (file as any).text = async () => "";

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(screen.queryByText("empty.csv")).toBeNull();
    expect(screen.queryByText("Map CSV Headers")).toBeNull();
  });

  test("upload flow: submits to /api/audience-upload, enables polling, and completes via polling (calls onUploadComplete)", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const supabase = makeSupabase();

    const { container } = render(
      <AudienceUploader
        supabase={supabase}
        audienceName="A1"
        onUploadComplete={mocks.onUploadComplete}
      />,
    );

    const fileInput = container.querySelector(
      'input[type="file"]#contacts',
    ) as HTMLInputElement;
    const csv = ["Name,Phone", "Alice,123"].join("\n");
    const file = new File([csv], "x.csv", { type: "text/csv" });
    (file as any).text = async () => csv;
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Mapping" }));

    // upload success response + verify split_name_column is present
    (globalThis as any).fetch = vi.fn(async (url: string, init?: any) => {
      if (String(url).includes("/api/audience-upload-status")) {
        return {
          ok: true,
          async json() {
            return { status: "completed", audience_id: 5 };
          },
        } as any;
      }
      if (String(url).includes("/api/audience-upload")) {
        const body = init?.body as FormData;
        expect(body.get("split_name_column")).toBe("name");
        return {
          ok: true,
          async json() {
            return { upload_id: 9, audience_id: "a1" };
          },
        } as any;
      }
      return {
        ok: true,
        async json() {
          return {};
        },
      } as any;
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start Upload" }));
    });

    await waitFor(() => {
      expect(mocks.interval.ms).toBe(2000);
    });
    await act(async () => {
      await mocks.interval.cb?.();
    });

    expect(screen.getByText("Completed!")).toBeInTheDocument();
    expect(mocks.onUploadComplete).toHaveBeenCalledWith("5");
  }, 15000);

  test("polling completion without onUploadComplete triggers redirect after 2s", async () => {
    vi.useFakeTimers();
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const supabase = makeSupabase();

    const { container } = render(
      <AudienceUploader supabase={supabase} audienceName="A1" />,
    );
    const fileInput = container.querySelector(
      'input[type="file"]#contacts',
    ) as HTMLInputElement;
    const csv = ["Phone", "123"].join("\n");
    const file = new File([csv], "x.csv", { type: "text/csv" });
    (file as any).text = async () => csv;
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Mapping" }));

    (globalThis as any).fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/api/audience-upload-status")) {
        return {
          ok: true,
          async json() {
            return { status: "completed", audienceId: 777 };
          },
        } as any;
      }
      if (String(url).includes("/api/audience-upload")) {
        return {
          ok: true,
          async json() {
            return { upload_id: 9, audience_id: "777" };
          },
        } as any;
      }
      return {
        ok: true,
        async json() {
          return {};
        },
      } as any;
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start Upload" }));
    });
    expect(mocks.interval.ms).toBe(2000);

    await act(async () => {
      await mocks.interval.cb?.();
    });

    expect(screen.getByText("Completed!")).toBeInTheDocument();
    expect(
      screen.getByText("Redirecting to audience page..."),
    ).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(mocks.navigate).toHaveBeenCalledWith("/workspaces/w1/audiences/777");
  }, 15000);

  test("completed without onUploadComplete redirects after 2s", async () => {
    vi.useFakeTimers();
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const supabase = makeSupabase();

    render(
      <AudienceUploader
        supabase={supabase}
        audienceName="A1"
        existingAudienceId="777"
      />,
    );

    await act(async () => {
      mocks.realtimeOpts.onChange({
        eventType: "UPDATE",
        new: {
          id: "777",
          status: "completed",
          total_contacts: 1,
          processed_contacts: 1,
        },
      });
    });

    expect(
      screen.getByText("Redirecting to audience page..."),
    ).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.navigate).toHaveBeenCalledWith("/workspaces/w1/audiences/777");
  });

  test("upload error response shows error, Try Again clears status/error, and polling error shows warning", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const supabase = makeSupabase();
    const { container } = render(
      <AudienceUploader supabase={supabase} audienceName="A1" />,
    );

    const fileInput = container.querySelector(
      'input[type="file"]#contacts',
    ) as HTMLInputElement;
    const file = new File(["Phone\n123"], "x.csv", { type: "text/csv" });
    (file as any).text = async () => "Phone\n123";
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Mapping" }));

    setFetchJsonOnce({ error: "bad" });
    fireEvent.click(screen.getByRole("button", { name: "Start Upload" }));

    await waitFor(() => {
      expect(screen.getByText("bad")).toBeInTheDocument();
    });
    expect(screen.getByText("bad")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(screen.queryByText("bad")).toBeNull();

    // now simulate polling error payload
    setFetchJsonOnce({ upload_id: 1, audience_id: "a1" });
    fireEvent.click(screen.getByRole("button", { name: "Start Upload" }));
    (globalThis as any).fetch = vi.fn(async () => {
      return {
        ok: true,
        async json() {
          return { error: "nope" };
        },
      } as any;
    });
    await waitFor(() => expect(mocks.interval.ms).toBe(2000));
    await act(async () => {
      await mocks.interval.cb?.();
    });
    await waitFor(() =>
      expect(
        screen.getByText("Live progress is delayed. Retrying automatically..."),
      ).toBeInTheDocument(),
    );
  });

  test("realtime UPDATE handles error status and progress calculation", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const supabase = makeSupabase();
    render(
      <AudienceUploader
        supabase={supabase}
        audienceName="A1"
        onUploadComplete={mocks.onUploadComplete}
      />,
    );

    await act(async () => {
      mocks.realtimeOpts.onChange({
        eventType: "UPDATE",
        new: {
          id: "1",
          status: "processing",
          total_contacts: 10,
          processed_contacts: 3,
        },
      });
    });
    expect(screen.getByText("Processing...")).toBeInTheDocument();
    expect(screen.getByRole("progressbar").textContent).toBe("30");

    await act(async () => {
      mocks.realtimeOpts.onChange({
        eventType: "UPDATE",
        new: { id: "1", status: "error", error_message: "x" },
      });
    });
    expect(screen.getByText("x")).toBeInTheDocument();
  });

  test("realtime UPDATE with missing status sets uploadStatus to null", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    render(<AudienceUploader supabase={makeSupabase()} audienceName="A1" />);

    await act(async () => {
      mocks.realtimeOpts.onChange({
        eventType: "UPDATE",
        new: { id: "1", total_contacts: 0, processed_contacts: 0 },
      });
    });

    expect(screen.queryByText("Processing...")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Start Upload" }),
    ).toBeInTheDocument();
  });

  test("realtime UPDATE error without error_message uses fallback", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    render(<AudienceUploader supabase={makeSupabase()} audienceName="A1" />);

    await act(async () => {
      mocks.realtimeOpts.onChange({
        eventType: "UPDATE",
        new: { id: "1", status: "error" },
      });
    });

    expect(
      screen.getByText("An error occurred during upload"),
    ).toBeInTheDocument();
  });

  test("realtime UPDATE with total_contacts negative does not compute progress", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    render(<AudienceUploader supabase={makeSupabase()} audienceName="A1" />);

    await act(async () => {
      mocks.realtimeOpts.onChange({
        eventType: "UPDATE",
        new: {
          id: "1",
          status: "processing",
          total_contacts: -1,
          processed_contacts: 0,
        },
      });
    });

    expect(screen.getByText("Processing...")).toBeInTheDocument();
    expect(screen.getByRole("progressbar").textContent).toBe("0");
  });

  test("realtime UPDATE with processed_contacts undefined does not compute progress", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    render(<AudienceUploader supabase={makeSupabase()} audienceName="A1" />);

    await act(async () => {
      mocks.realtimeOpts.onChange({
        eventType: "UPDATE",
        new: { id: "1", status: "processing", total_contacts: 10 },
      });
    });

    expect(screen.getByText("Processing...")).toBeInTheDocument();
    expect(screen.getByText("0 / 10 contacts")).toBeInTheDocument();
    expect(screen.getByRole("progressbar").textContent).toBe("0");
  });

  test("realtime UPDATE completed calls onUploadComplete", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const supabase = makeSupabase();
    render(
      <AudienceUploader
        supabase={supabase}
        audienceName="A1"
        onUploadComplete={mocks.onUploadComplete}
      />,
    );

    await act(async () => {
      mocks.realtimeOpts.onChange({
        eventType: "UPDATE",
        new: {
          id: 123,
          audience_id: 123,
          status: "completed",
          total_contacts: 1,
          processed_contacts: 1,
        },
      });
    });

    expect(screen.getByText("Completed!")).toBeInTheDocument();
    expect(screen.getByRole("progressbar").textContent).toBe("100");
    expect(mocks.onUploadComplete).toHaveBeenCalledWith("123");
  });

  test("unknown uploadStatus renders as Preparing...", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    render(<AudienceUploader supabase={makeSupabase()} audienceName="A1" />);

    await act(async () => {
      mocks.realtimeOpts.onChange({
        eventType: "UPDATE",
        new: {
          id: "1",
          status: "pending",
          total_contacts: 0,
          processed_contacts: 0,
        },
      });
    });

    expect(screen.getByText("Preparing...")).toBeInTheDocument();
  });

  test("polling callback returns early when no uploadId", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    render(<AudienceUploader supabase={makeSupabase()} audienceName="A1" />);

    (globalThis as any).fetch = vi.fn(async () => {
      return {
        ok: true,
        async json() {
          return {};
        },
      } as any;
    });

    await act(async () => {
      await mocks.interval.cb?.();
    });

    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  test("fetcher state: submitting does not affect uploader state", async () => {
    mocks.fetcher.state = "submitting";
    mocks.fetcher.data = undefined;

    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    render(<AudienceUploader supabase={makeSupabase()} audienceName="A1" />);

    expect(
      screen.getByRole("button", { name: "Start Upload" }),
    ).toBeInTheDocument();
  });

  test("fetcher state: loading with error does not affect uploader state", async () => {
    mocks.fetcher.state = "loading";
    mocks.fetcher.data = { error: "boom" };

    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    render(<AudienceUploader supabase={makeSupabase()} audienceName="A1" />);

    expect(screen.queryByText("boom")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Start Upload" }),
    ).toBeInTheDocument();
  });

  test("fetcher state: loading with audience_id does not affect uploader state", async () => {
    mocks.fetcher.state = "loading";
    mocks.fetcher.data = { audience_id: "55" };

    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    render(<AudienceUploader supabase={makeSupabase()} audienceName="A1" />);

    expect(
      screen.getByRole("button", { name: "Start Upload" }),
    ).toBeInTheDocument();
    expect(mocks.realtimeOpts.filter).toBeUndefined();
  });

  test("fetcher state: loading with no error/audience_id keeps default state", async () => {
    mocks.fetcher.state = "loading";
    mocks.fetcher.data = { success: true };

    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    render(<AudienceUploader supabase={makeSupabase()} audienceName="A1" />);

    expect(
      screen.getByRole("button", { name: "Start Upload" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Error")).toBeNull();
  });

  test("upload with existingAudienceId appends audience_id (not audience_name)", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const supabase = makeSupabase();

    const { container } = render(
      <AudienceUploader
        supabase={supabase}
        existingAudienceId="777"
        audienceName="ignored"
      />,
    );

    const fileInput = container.querySelector(
      'input[type="file"]#contacts',
    ) as HTMLInputElement;
    const csv = ["Phone", "123"].join("\n");
    const file = new File([csv], "x.csv", { type: "text/csv" });
    (file as any).text = async () => csv;
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Mapping" }));

    (globalThis as any).fetch = vi.fn(async (url: string, init?: any) => {
      if (String(url).includes("/api/audience-upload")) {
        const body = init?.body as FormData;
        expect(body.get("audience_id")).toBe("777");
        expect(body.get("audience_name")).toBeNull();
        return {
          ok: true,
          async json() {
            return { upload_id: 1, audience_id: "777" };
          },
        } as any;
      }
      return {
        ok: true,
        async json() {
          return {};
        },
      } as any;
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start Upload" }));
    });

    await waitFor(() => expect(mocks.interval.ms).toBe(2000));
  });

  test("upload POST throws non-Error -> shows generic unexpected error", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const supabase = makeSupabase();

    const { container } = render(
      <AudienceUploader supabase={supabase} audienceName="A1" />,
    );

    const fileInput = container.querySelector(
      'input[type="file"]#contacts',
    ) as HTMLInputElement;
    const csv = ["Phone", "123"].join("\n");
    const file = new File([csv], "x.csv", { type: "text/csv" });
    (file as any).text = async () => csv;
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Mapping" }));

    (globalThis as any).fetch = vi.fn(async () => {
      throw "nope";
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start Upload" }));
    });

    await waitFor(() => {
      expect(
        screen.getByText("An unexpected error occurred"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Try Again" }),
      ).toBeInTheDocument();
    });
  });

  test("polling throws -> shows warning and logs error", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const supabase = makeSupabase();

    const { container } = render(
      <AudienceUploader supabase={supabase} audienceName="A1" />,
    );

    const fileInput = container.querySelector(
      'input[type="file"]#contacts',
    ) as HTMLInputElement;
    const csv = ["Phone", "123"].join("\n");
    const file = new File([csv], "x.csv", { type: "text/csv" });
    (file as any).text = async () => csv;
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Mapping" }));

    (globalThis as any).fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/api/audience-upload-status")) {
        throw new Error("network");
      }
      if (String(url).includes("/api/audience-upload")) {
        return {
          ok: true,
          async json() {
            return { upload_id: 9, audience_id: "a1" };
          },
        } as any;
      }
      return {
        ok: true,
        async json() {
          return {};
        },
      } as any;
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start Upload" }));
    });
    await waitFor(() => expect(mocks.interval.ms).toBe(2000));

    await act(async () => {
      await mocks.interval.cb?.();
    });

    expect(
      screen.getByText("Live progress is delayed. Retrying automatically..."),
    ).toBeInTheDocument();
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("polling status=processing updates counts and progress", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const supabase = makeSupabase();

    const { container } = render(
      <AudienceUploader supabase={supabase} audienceName="A1" />,
    );

    const fileInput = container.querySelector(
      'input[type="file"]#contacts',
    ) as HTMLInputElement;
    const csv = ["Phone", "123"].join("\n");
    const file = new File([csv], "x.csv", { type: "text/csv" });
    (file as any).text = async () => csv;
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Mapping" }));

    (globalThis as any).fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/api/audience-upload-status")) {
        return {
          ok: true,
          async json() {
            return {
              status: "processing",
              total_contacts: 10,
              processed_contacts: 4,
            };
          },
        } as any;
      }
      if (String(url).includes("/api/audience-upload")) {
        return {
          ok: true,
          async json() {
            return { upload_id: 9, audience_id: "a1" };
          },
        } as any;
      }
      return {
        ok: true,
        async json() {
          return {};
        },
      } as any;
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start Upload" }));
    });
    await waitFor(() => expect(mocks.interval.ms).toBe(2000));

    await act(async () => {
      await mocks.interval.cb?.();
    });

    expect(screen.getByText("Processing...")).toBeInTheDocument();
    expect(screen.getByText("4 / 10 contacts")).toBeInTheDocument();
    expect(screen.getByRole("progressbar").textContent).toBe("40");
  });

  test("polling status=error sets uploadStatus error + message and stops polling", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const supabase = makeSupabase();

    const { container } = render(
      <AudienceUploader supabase={supabase} audienceName="A1" />,
    );

    const fileInput = container.querySelector(
      'input[type="file"]#contacts',
    ) as HTMLInputElement;
    const csv = ["Phone", "123"].join("\n");
    const file = new File([csv], "x.csv", { type: "text/csv" });
    (file as any).text = async () => csv;
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Mapping" }));

    (globalThis as any).fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/api/audience-upload-status")) {
        return {
          ok: true,
          async json() {
            return { status: "error", error_message: "poll-bad" };
          },
        } as any;
      }
      if (String(url).includes("/api/audience-upload")) {
        return {
          ok: true,
          async json() {
            return { upload_id: 9, audience_id: "a1" };
          },
        } as any;
      }
      return {
        ok: true,
        async json() {
          return {};
        },
      } as any;
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start Upload" }));
    });
    await waitFor(() => expect(mocks.interval.ms).toBe(2000));

    await act(async () => {
      await mocks.interval.cb?.();
    });

    expect(screen.getByText("poll-bad")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try Again" }),
    ).toBeInTheDocument();
    expect(mocks.interval.ms).toBeNull();
  });

  test("polling status=error without error_message uses fallback", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const supabase = makeSupabase();

    const { container } = render(
      <AudienceUploader supabase={supabase} audienceName="A1" />,
    );

    const fileInput = container.querySelector(
      'input[type="file"]#contacts',
    ) as HTMLInputElement;
    const csv = ["Phone", "123"].join("\n");
    const file = new File([csv], "x.csv", { type: "text/csv" });
    (file as any).text = async () => csv;
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Mapping" }));

    (globalThis as any).fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/api/audience-upload-status")) {
        return {
          ok: true,
          async json() {
            return { status: "error" };
          },
        } as any;
      }
      if (String(url).includes("/api/audience-upload")) {
        return {
          ok: true,
          async json() {
            return { upload_id: 9, audience_id: "a1" };
          },
        } as any;
      }
      return {
        ok: true,
        async json() {
          return {};
        },
      } as any;
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start Upload" }));
    });
    await waitFor(() => expect(mocks.interval.ms).toBe(2000));

    await act(async () => {
      await mocks.interval.cb?.();
    });

    expect(
      screen.getByText("An error occurred during upload"),
    ).toBeInTheDocument();
  });

  test("polling status=processing with total_contacts=0 does not update progress", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const supabase = makeSupabase();

    const { container } = render(
      <AudienceUploader supabase={supabase} audienceName="A1" />,
    );

    const fileInput = container.querySelector(
      'input[type="file"]#contacts',
    ) as HTMLInputElement;
    const csv = ["Phone", "123"].join("\n");
    const file = new File([csv], "x.csv", { type: "text/csv" });
    (file as any).text = async () => csv;
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Mapping" }));

    (globalThis as any).fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/api/audience-upload-status")) {
        return {
          ok: true,
          async json() {
            return {
              status: "processing",
              total_contacts: 0,
              processed_contacts: 0,
            };
          },
        } as any;
      }
      if (String(url).includes("/api/audience-upload")) {
        return {
          ok: true,
          async json() {
            return { upload_id: 9, audience_id: "a1" };
          },
        } as any;
      }
      return {
        ok: true,
        async json() {
          return {};
        },
      } as any;
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start Upload" }));
    });
    await waitFor(() => expect(mocks.interval.ms).toBe(2000));

    await act(async () => {
      await mocks.interval.cb?.();
    });

    expect(screen.getByText("Processing...")).toBeInTheDocument();
    expect(screen.getByText("0 / 0 contacts")).toBeInTheDocument();
    expect(screen.getByRole("progressbar").textContent).toBe("0");
  });
});
