import React, { useEffect } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    navigationState: "idle" as "idle" | "submitting" | "loading",
    navigate: vi.fn(),
    fetcherSubmit: vi.fn(),
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ asChild, children, ...props }: any) => {
    if (asChild) return <>{children}</>;
    return (
      <button type={props.type ?? "button"} {...props}>
        {children}
      </button>
    );
  },
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, onOpenChange, children }: any) => {
    useEffect(() => {
      if (open && typeof onOpenChange === "function") {
        onOpenChange(open);
      }
    }, [open, onOpenChange]);
    if (!open) return null;
    return <div data-testid="dialog">{children}</div>;
  },
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@remix-run/react", () => ({
  Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
  NavLink: ({ to, children }: any) => <a href={String(to)}>{children}</a>,
  useFetcher: () => ({ submit: (...args: any[]) => mocks.fetcherSubmit(...args) }),
  useNavigate: () => mocks.navigate,
  useNavigation: () => ({ state: mocks.navigationState }),
}));

function baseProps(overrides: Partial<any> = {}) {
  return {
    isDialogOpen: false,
    setDialog: vi.fn(),
    isErrorDialogOpen: false,
    setErrorDialog: vi.fn(),
    isReportDialogOpen: false,
    setReportDialog: vi.fn(),
    campaign: { title: "Camp", dial_type: "call", voicemail_file: false },
    currentState: { x: 1 },
    fetchMore: vi.fn(),
    householdMap: {},
    isActive: true,
    creditsError: false,
    hasAccess: true,
    ...overrides,
  };
}

describe("app/components/call/CallScreen.Dialogs.tsx", () => {
  test("inactive campaign dialog calls navigate(-1) via OK and onOpenChange", async () => {
    const { CampaignDialogs } = await import("@/components/call/CallScreen.Dialogs");
    mocks.navigate.mockReset();

    render(<CampaignDialogs {...baseProps({ isActive: false })} />);

    expect(screen.getByText("This campaign is currently inactive.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(mocks.navigate).toHaveBeenCalledWith(-1);
  });

  test("welcome dialog (call dial_type) renders copy and Get started fetches more + closes", async () => {
    const { CampaignDialogs } = await import("@/components/call/CallScreen.Dialogs");
    const fetchMore = vi.fn();
    const setDialog = vi.fn();

    render(
      <CampaignDialogs
        {...baseProps({
          isDialogOpen: true,
          isActive: true,
          setDialog,
          fetchMore,
          householdMap: { h1: [] },
          campaign: { title: "T1", dial_type: "call", voicemail_file: true },
        })}
      />,
    );

    expect(screen.getByText("Welcome to T1.")).toBeInTheDocument();
    expect(screen.getByText(/power dialer campaign/i)).toBeInTheDocument();
    expect(screen.getByText(/leave a voicemail with the contact/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    expect(fetchMore).toHaveBeenCalledWith({ householdMap: { h1: [] } });
    expect(setDialog).toHaveBeenCalledWith(false);
  });

  test("welcome dialog (predictive dial_type) does not fetchMore but closes", async () => {
    const { CampaignDialogs } = await import("@/components/call/CallScreen.Dialogs");
    const fetchMore = vi.fn();
    const setDialog = vi.fn();

    render(
      <CampaignDialogs
        {...baseProps({
          isDialogOpen: true,
          isActive: true,
          setDialog,
          fetchMore,
          householdMap: { h1: [] },
          campaign: { title: "T2", dial_type: "predictive", voicemail_file: false },
        })}
      />,
    );

    expect(screen.getByText(/predictive dialer campaign/i)).toBeInTheDocument();
    expect(screen.getByText(/disconnect your call accordingly/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    expect(fetchMore).not.toHaveBeenCalled();
    expect(setDialog).toHaveBeenCalledWith(false);
  });

  test("no-script error dialog renders when open", async () => {
    const { CampaignDialogs } = await import("@/components/call/CallScreen.Dialogs");
    render(<CampaignDialogs {...baseProps({ isErrorDialogOpen: true })} />);
    expect(screen.getByText("NO SCRIPT SET UP")).toBeInTheDocument();
    expect(screen.getByText("Go Back")).toBeInTheDocument();
  });

  test("report dialog submits JSON and cancel closes", async () => {
    const { CampaignDialogs } = await import("@/components/call/CallScreen.Dialogs");
    mocks.fetcherSubmit.mockReset();

    const setReportDialog = vi.fn();
    render(
      <CampaignDialogs
        {...baseProps({
          isReportDialogOpen: true,
          setReportDialog,
          currentState: { s: "state" },
        })}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Describe the issue here..."), {
      target: { value: "bad" },
    });
    const form = screen.getByRole("button", { name: "Submit Report" }).closest("form") as HTMLFormElement;
    fireEvent.submit(form);

    expect(mocks.fetcherSubmit).toHaveBeenCalledWith(
      JSON.stringify({ errorDescription: "bad", currentState: { s: "state" } }),
      expect.objectContaining({
        action: "/api/error-report",
        method: "POST",
        encType: "application/json",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(setReportDialog).toHaveBeenCalledWith(false);
  });

  test("credits dialog copy + link target depends on hasAccess; navigation state gates auto-open", async () => {
    const { CampaignDialogs } = await import("@/components/call/CallScreen.Dialogs");

    // When not idle, effect does not sync credits dialog with creditsError changes
    mocks.navigationState = "submitting";
    const { rerender } = render(
      <CampaignDialogs {...baseProps({ creditsError: false, hasAccess: true })} />,
    );
    rerender(<CampaignDialogs {...baseProps({ creditsError: true, hasAccess: true })} />);
    expect(screen.queryByText("No Credits Remaining")).toBeNull();

    // When idle, it syncs and opens
    mocks.navigationState = "idle";
    rerender(<CampaignDialogs {...baseProps({ creditsError: true, hasAccess: true })} />);
    expect(screen.getByText("No Credits Remaining")).toBeInTheDocument();
    expect(screen.getByText(/purchase more credits/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Purchase Credits" }).getAttribute("href")).toContain("billing");

    // hasAccess=false branch
    rerender(<CampaignDialogs {...baseProps({ creditsError: true, hasAccess: false })} />);
    expect(screen.getByText("Campaign Disabled")).toBeInTheDocument();
    expect(screen.getByText(/contact your administrator/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go Back" }).getAttribute("href")).toBe("..");
  });
});

