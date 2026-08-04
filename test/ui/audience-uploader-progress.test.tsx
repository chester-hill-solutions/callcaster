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

describe("AudienceUploader progress polling", () => {
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

  test("polling throws -> shows warning and logs error", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const { container } = render(<AudienceUploader audienceName="A1" />);

    await goToReview(container, ["Phone", "123"].join("\n"));

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
    await waitFor(() => expect(mocks.interval.ms).toBe(5000));

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
    const { container } = render(<AudienceUploader audienceName="A1" />);

    await goToReview(container, ["Phone", "123"].join("\n"));

    (globalThis as any).fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/api/audience-upload-status")) {
        return {
          ok: true,
          async json() {
            return {
              ok: true,
              snapshot: {
                status: "processing",
                total_contacts: 10,
                processed_contacts: 4,
              },
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
    await waitFor(() => expect(mocks.interval.ms).toBe(5000));

    await act(async () => {
      await mocks.interval.cb?.();
    });

    expect(screen.getByText("Processing...")).toBeInTheDocument();
    expect(screen.getByText("4 / 10 contacts")).toBeInTheDocument();
    expect(screen.getByRole("progressbar").textContent).toBe("40");
  });

  test("polling status=error sets error + message and stops polling", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const { container } = render(<AudienceUploader audienceName="A1" />);

    await goToReview(container, ["Phone", "123"].join("\n"));

    (globalThis as any).fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/api/audience-upload-status")) {
        return {
          ok: true,
          async json() {
            return { ok: true, snapshot: { status: "error", error_message: "poll-bad" } };
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

    // The immediate post-submit status check surfaces the error without
    // waiting for a poll tick (#1078); polling never starts for an error.
    expect(screen.getByText("poll-bad")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try Again" }),
    ).toBeInTheDocument();
    expect(mocks.interval.ms).toBeNull();
  });

  test("polling status=error without error_message uses fallback", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const { container } = render(<AudienceUploader audienceName="A1" />);

    await goToReview(container, ["Phone", "123"].join("\n"));

    (globalThis as any).fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/api/audience-upload-status")) {
        return {
          ok: true,
          async json() {
            return { ok: true, snapshot: { status: "error" } };
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

    // Error arrives from the immediate post-submit status check (#1078).
    expect(
      screen.getByText("An error occurred during upload"),
    ).toBeInTheDocument();
  });

  test("polling status=processing with total_contacts=0 keeps client-seeded total", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const { container } = render(<AudienceUploader audienceName="A1" />);

    await goToReview(container, ["Phone", "123"].join("\n"));

    (globalThis as any).fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/api/audience-upload-status")) {
        return {
          ok: true,
          async json() {
            return {
              ok: true,
              snapshot: {
                status: "processing",
                total_contacts: 0,
                processed_contacts: 0,
              },
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
    await waitFor(() => expect(mocks.interval.ms).toBe(5000));

    expect(screen.getByText("0 / 1 contacts")).toBeInTheDocument();

    await act(async () => {
      await mocks.interval.cb?.();
    });

    expect(screen.getByText("Processing...")).toBeInTheDocument();
    expect(screen.getByText("0 / 1 contacts")).toBeInTheDocument();
    expect(screen.getByRole("progressbar").textContent).toBe("0");
  });

  test("repeated status poll failures keep polling with a warning (non-terminal)", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const { container } = render(<AudienceUploader audienceName="A1" />);

    await goToReview(container, ["Phone", "123"].join("\n"));

    (globalThis as any).fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/api/audience-upload-status")) {
        return {
          ok: false,
          status: 500,
          async json() {
            return { ok: false, error: "temporary" };
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
    await waitFor(() => expect(mocks.interval.ms).toBe(5000));

    for (let i = 0; i < 6; i++) {
      await act(async () => {
        await mocks.interval.cb?.();
      });
    }

    expect(
      screen.getByText("Live progress is delayed. Retrying automatically..."),
    ).toBeInTheDocument();
    expect(screen.getByText("Processing...")).toBeInTheDocument();
    expect(mocks.interval.ms).toBe(5000);
  });

  test("failed upload status with sidecar error field shows Error, not delayed warning", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const { container } = render(<AudienceUploader audienceName="A1" />);

    await goToReview(container, ["Phone", "123"].join("\n"));

    (globalThis as any).fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/api/audience-upload-status")) {
        return {
          ok: true,
          async json() {
            return {
              ok: true,
              snapshot: {
                uploadId: 9,
                audience_id: "a1",
                status: "error",
                error_message: "column support_level does not exist",
                stage: "Upload failed",
                total_contacts: 1,
                processed_contacts: 0,
              },
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

    // Immediate post-submit status check must treat sidecar `error` as the
    // upload failure (via status=error), not as a transient poll failure.
    expect(
      screen.getByText("column support_level does not exist"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try Again" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Live progress is delayed. Retrying automatically..."),
    ).toBeNull();
    expect(mocks.interval.ms).toBeNull();
  });

  test("non-JSON status response is treated as a transient poll failure", async () => {
    const { default: AudienceUploader } =
      await import("@/components/audience/AudienceUploader");
    const { container } = render(<AudienceUploader audienceName="A1" />);

    await goToReview(container, ["Phone", "123"].join("\n"));

    (globalThis as any).fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/api/audience-upload-status")) {
        return {
          ok: false,
          status: 502,
          async json() {
            throw new Error("Unexpected token < in JSON");
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
    await waitFor(() => expect(mocks.interval.ms).toBe(5000));

    await act(async () => {
      await mocks.interval.cb?.();
    });

    expect(
      screen.getByText("Live progress is delayed. Retrying automatically..."),
    ).toBeInTheDocument();
    expect(mocks.interval.ms).toBe(5000);
    expect(screen.queryByText("Error")).toBeNull();
  });
});
