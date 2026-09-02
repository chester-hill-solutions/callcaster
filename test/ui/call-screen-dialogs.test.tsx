import React from "react";
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
  Dialog: ({ open, children }: any) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children, className }: any) => <div data-testid="dialog-content" className={className}>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div data-testid="dialog-title">{children}</div>,
  DialogDescription: ({ children }: any) => <div data-testid="dialog-description">{children}</div>,
}));

vi.mock("react-router", () => ({
  Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
  useFetcher: () => ({
    submit: (...args: any[]) => mocks.fetcherSubmit(...args),
    state: "idle",
    data: undefined,
  }),
  useNavigate: () => mocks.navigate,
  useParams: () => ({ id: "ws-1", campaign_id: "77" }),
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
    campaign: { title: "Camp", dial_type: "call", voicemail_file: false, status: "running" },
    currentState: { x: 1 },
    fetchMore: vi.fn(),
    householdMap: {},
    isActive: true,
    onLeaveCampaign: vi.fn(),
    onJoin: vi.fn(),
    ...overrides,
  };
}

describe("app/components/call/CallScreen.Dialogs.tsx", () => {
  test("inactive campaign dialog uses the standard header/description composition", async () => {
    const { CampaignDialogs } = await import("@/components/call/CallScreen.Dialogs");
    mocks.navigate.mockReset();

    render(<CampaignDialogs {...baseProps({ isActive: false })} />);

    // Title lives in DialogTitle, the explanation in DialogDescription (#1126:
    // previously a centered oversized title plus a hand-wrapped <p>).
    expect(screen.getByText("This campaign is currently inactive.")).toBeInTheDocument();
    expect(screen.getByTestId("dialog-title")).toHaveTextContent("This campaign is currently inactive.");
    expect(screen.getByTestId("dialog-description")).toHaveTextContent(
      /outside of the designated calling window/i,
    );

    // Standard width treatment; the old centered/grid artifacts are gone.
    const content = screen.getByTestId("dialog-content");
    expect(content.className).toContain("sm:max-w-[450px]");
    expect(content.className).not.toContain("grid-cols-1");

    // Nothing navigates until OK is pressed (the mock no longer auto-fires
    // onOpenChange, so this assertion cannot pass from mount effects).
    expect(mocks.navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    // Explicit destination, never navigate(-1) — history-back stranded
    // direct-link visitors on about:blank (#1462).
    expect(mocks.navigate).toHaveBeenCalledWith("/workspaces/ws-1/campaigns/77");
  });

  test("welcome dialog (call dial_type) renders copy and Get started fetches more + closes", async () => {
    const { CampaignDialogs } = await import("@/components/call/CallScreen.Dialogs");
    const fetchMore = vi.fn();
    const setDialog = vi.fn();
    const onLeaveCampaign = vi.fn();
    const onJoin = vi.fn();

    render(
      <CampaignDialogs
        {...baseProps({
          isDialogOpen: true,
          isActive: true,
          setDialog,
          fetchMore,
          householdMap: { h1: [] },
          campaign: { title: "T1", dial_type: "call", voicemail_file: true },
          onLeaveCampaign,
          onJoin,
        })}
      />,
    );

    expect(screen.getByText("Welcome to T1.")).toBeInTheDocument();
    expect(screen.getByText(/power dialer campaign/i)).toBeInTheDocument();
    expect(screen.getByText(/leave a voicemail with the contact/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    expect(fetchMore).toHaveBeenCalledWith({ householdMap: { h1: [] } });
    expect(setDialog).toHaveBeenCalledWith(false);
    expect(onJoin).toHaveBeenCalledTimes(1);
    expect(onLeaveCampaign).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(onLeaveCampaign).toHaveBeenCalledTimes(1);
  });

  test("welcome dialog (predictive dial_type) does not fetchMore but closes", async () => {
    const { CampaignDialogs } = await import("@/components/call/CallScreen.Dialogs");
    const fetchMore = vi.fn();
    const setDialog = vi.fn();
    const onJoin = vi.fn();

    render(
      <CampaignDialogs
        {...baseProps({
          isDialogOpen: true,
          isActive: true,
          setDialog,
          fetchMore,
          householdMap: { h1: [] },
          campaign: { title: "T2", dial_type: "predictive", voicemail_file: false },
          onJoin,
        })}
      />,
    );

    expect(screen.getByText(/predictive dialer campaign/i)).toBeInTheDocument();
    expect(screen.getByText(/disconnect your call accordingly/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    expect(fetchMore).not.toHaveBeenCalled();
    expect(setDialog).toHaveBeenCalledWith(false);
    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  test("no-script error dialog renders when open and Leave triggers cleanup (#1313)", async () => {
    const { CampaignDialogs } = await import("@/components/call/CallScreen.Dialogs");
    const onLeaveCampaign = vi.fn();
    render(
      <CampaignDialogs
        {...baseProps({ isErrorDialogOpen: true, onLeaveCampaign })}
      />,
    );
    expect(screen.getByText("NO SCRIPT SET UP")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(onLeaveCampaign).toHaveBeenCalledTimes(1);
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

  // The zero-credits dialog was removed: it duplicated the credits-error-banner
  // in CallScreen.Layout (both rendered "No Credits Remaining"/"Campaign
  // Disabled", breaking Playwright strict mode once RR8 hydration made the
  // dialog actually mount). The banner — including its Purchase Credits billing
  // link — is covered by e2e specs DIAL-08 and RBAC-18.
});
