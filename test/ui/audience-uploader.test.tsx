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
    realtimeOpts: null as any,
    interval: {
      cb: null as null | (() => Promise<void> | void),
      ms: null as any,
    },
    logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
    onUploadComplete: vi.fn(),
  };
});

vi.mock("react-router", () => ({
  useParams: () => mocks.params,
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/hooks/realtime/useWorkspaceRealtime", () => ({
  useWorkspaceEventSubscription: (opts: any) => {
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
  MdUploadFile: () => <span>upload</span>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

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

async function selectCsvFile(
  container: HTMLElement,
  csv: string,
  fileName = "contacts.csv",
) {
  const fileInput = container.querySelector(
    'input[type="file"]#contacts',
  ) as HTMLInputElement;
  const file = new File([csv], fileName, { type: "text/csv" });
  (file as any).text = async () => csv;
  await act(async () => {
    fireEvent.change(fileInput, { target: { files: [file] } });
  });
  return fileInput;
}

async function goToReview(container: HTMLElement, csv: string, fileName?: string) {
  await selectCsvFile(container, csv, fileName);
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

/** Reach the processing phase with polling enabled. */
async function startUpload(
  container: HTMLElement,
  csv = "Phone\n123",
  uploadResponse: Record<string, unknown> = {
    upload_id: 9,
    audience_id: "a1",
  },
  statusHandler?: (url: string) => any,
) {
  await goToReview(container, csv);

  (globalThis as any).fetch = vi.fn(async (url: string, init?: any) => {
    if (String(url).includes("/api/audience-upload-status")) {
      if (statusHandler) return statusHandler(url);
      return {
        ok: true,
        async json() {
          return { ok: true, snapshot: { status: "processing" } };
        },
      } as any;
    }
    if (String(url).includes("/api/audience-upload")) {
      return {
        ok: true,
        async json() {
          return uploadResponse;
        },
        _init: init,
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
  await waitFor(() => expect(mocks.interval.ms).toBe(5000));
}

describe("app/components/audience/AudienceUploader.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.navigate.mockReset();
    mocks.realtimeOpts = null;
    mocks.interval.cb = null;
    mocks.interval.ms = null;
    mocks.logger.error.mockReset();
    mocks.onUploadComplete.mockReset();
    vi.useRealTimers();
    (globalThis as any).fetch = undefined;
  });

  test("renders file step with step strip in standalone mode", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    render(<AudienceUploader />);
    expect(
      screen.getByText("Drop or choose a CSV file"),
    ).toBeInTheDocument();
    expect(screen.getByText("1. Select file")).toBeInTheDocument();
  });

  test("accepts a CSV dropped onto the file picker", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    render(<AudienceUploader audienceName="A1" />);
    const file = new File(["Phone\n123"], "contacts.csv", { type: "text/csv" });
    (file as any).text = async () => "Phone\n123";
    const dropZone = screen.getByText("Drop or choose a CSV file").closest("label");

    expect(dropZone).not.toBeNull();
    fireEvent.drop(dropZone!, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("Map CSV Headers")).toBeInTheDocument();
    });
  });

  test("shows an active drag state while a file is over the zone and clears it on leave/drop (#1203)", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    render(<AudienceUploader audienceName="A1" />);
    const dropZone = screen.getByText("Drop or choose a CSV file").closest("label");
    expect(dropZone).not.toBeNull();

    // The drag-active contract is exposed as a stable data attribute; the
    // exact highlight classes are a styling concern that may change.
    expect(dropZone!.dataset.dragActive).toBe("false");
    fireEvent.dragEnter(dropZone!, { dataTransfer: { files: [] } });
    expect(dropZone!.dataset.dragActive).toBe("true");

    // Nested children emit their own dragleave; the active state must persist
    // until the cursor truly leaves the zone.
    fireEvent.dragEnter(dropZone!, { dataTransfer: { files: [] } });
    fireEvent.dragLeave(dropZone!, { dataTransfer: { files: [] } });
    expect(dropZone!.dataset.dragActive).toBe("true");

    // Leaving fully clears the highlight.
    fireEvent.dragLeave(dropZone!, { dataTransfer: { files: [] } });
    expect(dropZone!.dataset.dragActive).toBe("false");

    // Re-entering then dropping clears it and still imports the file.
    const file = new File(["Phone\n123"], "contacts.csv", { type: "text/csv" });
    (file as any).text = async () => "Phone\n123";
    fireEvent.dragEnter(dropZone!, { dataTransfer: { files: [file] } });
    expect(dropZone!.dataset.dragActive).toBe("true");
    fireEvent.drop(dropZone!, { dataTransfer: { files: [file] } });
    expect(dropZone!.dataset.dragActive).toBe("false");
    await waitFor(() => {
      expect(screen.getByText("Map CSV Headers")).toBeInTheDocument();
    });
  });

  test("recovers the highlight after an OS-interrupted drag delivers an unpaired dragleave (#1358)", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    render(<AudienceUploader audienceName="A1" />);
    const dropZone = screen.getByText("Drop or choose a CSV file").closest("label");
    expect(dropZone).not.toBeNull();

    // Hovering normally lights the zone.
    fireEvent.dragEnter(dropZone!, { dataTransfer: { files: [] } });
    expect(dropZone!.dataset.dragActive).toBe("true");

    // The OS can steal key-window mid-drag (Helium repro, even on a bare
    // page) and deliver a dragleave with no matching dragenter. The highlight
    // must not stay dead: the next continuous dragover re-asserts it.
    fireEvent.dragLeave(dropZone!, { dataTransfer: { files: [] } });
    expect(dropZone!.dataset.dragActive).toBe("false");
    fireEvent.dragOver(dropZone!, { dataTransfer: { files: [] } });
    expect(dropZone!.dataset.dragActive).toBe("true");

    // A genuine leave afterwards still clears it, and drop still works.
    fireEvent.dragLeave(dropZone!, { dataTransfer: { files: [] } });
    expect(dropZone!.dataset.dragActive).toBe("false");

    const file = new File(["Phone\n123"], "contacts.csv", { type: "text/csv" });
    (file as any).text = async () => "Phone\n123";
    fireEvent.dragEnter(dropZone!, { dataTransfer: { files: [file] } });
    fireEvent.drop(dropZone!, { dataTransfer: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText("Map CSV Headers")).toBeInTheDocument();
    });
  });

  test("hides step strip when embedded (onUploadComplete)", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    render(<AudienceUploader onUploadComplete={mocks.onUploadComplete} />);
    expect(
      screen.getByText("Drop or choose a CSV file"),
    ).toBeInTheDocument();
    expect(screen.queryByText("1. File")).toBeNull();
  });

  test("realtime ignores non-UPDATE events and idle snapshots", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    render(<AudienceUploader audienceName="A1" />);

    await act(async () => {
      mocks.realtimeOpts.onChange({
        eventType: "INSERT",
        new: { status: "completed", id: 1 },
      });
      mocks.realtimeOpts.onChange({ eventType: "UPDATE" });
      mocks.realtimeOpts.onChange({
        eventType: "UPDATE",
        new: { status: "completed", audience_id: 1 },
      });
    });

    expect(screen.queryByText("Completed!")).toBeNull();
    expect(
      screen.getByText("Drop or choose a CSV file"),
    ).toBeInTheDocument();
  });

  test("file selection parses CSV, shows mapping table + preview, supports mapping edits + review split-name, and choose another file", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");

    const { container } = render(<AudienceUploader audienceName="A1" />);

    const fileInput = container.querySelector(
      'input[type="file"]#contacts',
    ) as HTMLInputElement;
    const csv = ["Name,Phone,Weird", "Alice,123,null", "Bob,,x"].join("\n");

    fireEvent.change(fileInput, { target: { files: [] } });

    await selectCsvFile(container, csv);

    expect(screen.getByText("contacts.csv")).toBeInTheDocument();
    expect(screen.getByText("Map CSV Headers")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Contacts need a valid phone number to dial or message/,
      ),
    ).toBeInTheDocument();

    const rows = screen.getAllByRole("row");
    const weirdRow = rows.find((r) =>
      (r as HTMLElement).textContent?.toLowerCase().includes("weird"),
    ) as HTMLElement;
    const sel = weirdRow.querySelector("select") as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: "city" } });
    expect(sel.value).toBe("city");

    expect(screen.getByText("Data Preview (First 5 rows)")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText(/2 rows 3 columns/)).toBeInTheDocument();
    const split = screen.getByLabelText(
      "Split full name into first name and last name",
    ) as HTMLInputElement;
    expect(split.checked).toBe(true);
    fireEvent.click(split);
    expect(split.checked).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("CSV Header")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Choose another file" }));
    expect(screen.queryByText("contacts.csv")).toBeNull();
    expect(screen.getByText("Drop or choose a CSV file")).toBeInTheDocument();
  });

  test("file selection infers split from 'Full Name' header", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");

    const { container } = render(<AudienceUploader audienceName="A1" />);

    await goToReview(container, ["Full Name,Phone", "Alice A,123"].join("\n"));

    expect(
      screen.getByLabelText("Split full name into first name and last name"),
    ).toBeInTheDocument();
  });

  test("file selection with empty file contents is a no-op", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");

    const { container } = render(<AudienceUploader audienceName="A1" />);

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

  test("blocks continue until one phone column has a unique target", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const { container } = render(<AudienceUploader audienceName="A1" />);
    await selectCsvFile(
      container,
      "Email,Mobile,Telephone\na@example.com,4165551234,6475551234",
    );

    expect(
      screen.getByText("Phone number is assigned to more than one CSV column."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    const telephoneRow = screen
      .getAllByRole("row")
      .find((row) => row.textContent?.toLowerCase().includes("telephone"));
    fireEvent.change(within(telephoneRow as HTMLElement).getByRole("combobox"), {
      target: { value: "other_data" },
    });

    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  test("shows opt-out disclosure when opt_out is mapped", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const { container } = render(<AudienceUploader audienceName="A1" />);
    await selectCsvFile(container, "Phone,Opt Out\n4165551234,yes");

    expect(
      screen.getByText(
        /Opt-out status marks contacts who should not be contacted/,
      ),
    ).toBeInTheDocument();
  });

  test("upload flow: submits, polls, completes; embedded skips completion chrome", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");

    const { container } = render(
      <AudienceUploader
        audienceName="A1"
        onUploadComplete={mocks.onUploadComplete}
      />,
    );

    await goToReview(container, ["Name,Phone", "Alice,123"].join("\n"));

    (globalThis as any).fetch = vi.fn(async (url: string, init?: any) => {
      if (String(url).includes("/api/audience-upload-status")) {
        return {
          ok: true,
          async json() {
            return { ok: true, snapshot: { status: "completed", audience_id: 5 } };
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

    // The immediate post-submit status check picks up completion without
    // waiting for a poll tick (#1078).
    await waitFor(() => {
      expect(mocks.onUploadComplete).toHaveBeenCalledWith("5");
    });

    expect(screen.getByText("Completed!")).toBeInTheDocument();
    expect(screen.getByText("Redirecting to audience page...")).toBeInTheDocument();
  }, 15000);

  test("polling completion without onUploadComplete shows chrome and redirects after 2s", async () => {
    vi.useFakeTimers();
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");

    const { container } = render(<AudienceUploader audienceName="A1" />);
    await goToReview(container, ["Phone", "123"].join("\n"));

    (globalThis as any).fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/api/audience-upload-status")) {
        return {
          ok: true,
          async json() {
            return { ok: true, snapshot: { status: "completed" } };
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

    // Completion arrives from the immediate post-submit status check (#1078).
    expect(screen.getByText("Completed!")).toBeInTheDocument();
    expect(
      screen.getByText("Redirecting to audience page..."),
    ).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(mocks.navigate).toHaveBeenCalledWith("/workspaces/w1/audiences/777");
  }, 15000);

  test("realtime UPDATE during processing handles error and progress", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const { container } = render(
      <AudienceUploader
        audienceName="A1"
        onUploadComplete={mocks.onUploadComplete}
      />,
    );

    await startUpload(container);

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

  test("realtime UPDATE with missing status keeps processing view", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const { container } = render(<AudienceUploader audienceName="A1" />);

    await startUpload(container);

    await act(async () => {
      mocks.realtimeOpts.onChange({
        eventType: "UPDATE",
        new: { id: "1", total_contacts: 0, processed_contacts: 0 },
      });
    });

    expect(screen.getByText("Processing...")).toBeInTheDocument();
  });

  test("realtime UPDATE error without error_message uses fallback", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const { container } = render(<AudienceUploader audienceName="A1" />);

    await startUpload(container);

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
    const { container } = render(<AudienceUploader audienceName="A1" />);

    await startUpload(container);

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
    const { container } = render(<AudienceUploader audienceName="A1" />);

    await startUpload(container);

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

  test("realtime UPDATE completed calls onUploadComplete without chrome", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const { container } = render(
      <AudienceUploader
        audienceName="A1"
        onUploadComplete={mocks.onUploadComplete}
      />,
    );

    await startUpload(container);

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
    expect(mocks.onUploadComplete).toHaveBeenCalledWith("123");
  });

  test("pending server status maps to Processing label", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const { container } = render(<AudienceUploader audienceName="A1" />);

    await startUpload(container);

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

    expect(screen.getByText("Processing...")).toBeInTheDocument();
    expect(screen.queryByText("Preparing...")).toBeNull();
  });

  test("polling callback returns early when no uploadId", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    render(<AudienceUploader audienceName="A1" />);

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

  test("upload with existingAudienceId appends audience_id (not audience_name)", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");

    const { container } = render(
      <AudienceUploader
        existingAudienceId="777"
        audienceName="ignored"
      />,
    );

    await goToReview(container, ["Phone", "123"].join("\n"));

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

    await waitFor(() => expect(mocks.interval.ms).toBe(5000));
  });

  test("upload error response shows error, Try Again clears and returns to review", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const { container } = render(<AudienceUploader audienceName="A1" />);

    await goToReview(container, "Phone\n123");

    setFetchJsonOnce({ error: "bad" });
    fireEvent.click(screen.getByRole("button", { name: "Start Upload" }));

    await waitFor(() => {
      expect(screen.getByText("bad")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(screen.queryByText("bad")).toBeNull();
    expect(screen.getByRole("button", { name: "Start Upload" })).toBeInTheDocument();
  });

  test("upload POST throws non-Error -> shows generic unexpected error", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const { container } = render(<AudienceUploader audienceName="A1" />);

    await goToReview(container, ["Phone", "123"].join("\n"));

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
});
