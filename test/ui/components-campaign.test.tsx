import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { makeCampaign, noop, SmokeRouter } from "./_helpers/component-smoke";

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  const fetcher = { submit: vi.fn(), state: "idle" as const, data: null, Form: ({ children, ...p }: any) => <form {...p}>{children}</form> };
  return {
    ...actual,
    useFetcher: () => fetcher,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: "/workspaces/w1/campaigns/1", search: "", hash: "" }),
    NavLink: ({ children, to, className, ...rest }: any) => (
      <a
        href={String(to)}
        className={typeof className === "function" ? className({ isActive: false, isPending: false }) : className}
        {...rest}
      >
        {typeof children === "function" ? children({ isActive: false, isPending: false }) : children}
      </a>
    ),
    Link: ({ children, to, ...rest }: any) => <a href={String(to)} {...rest}>{children}</a>,
    Form: ({ children, ...p }: any) => <form {...p}>{children}</form>,
  };
});

const handleInputChange = vi.fn();

describe("app/components/campaign/CampaignEmptyState.tsx", () => {
  test("campaign and number types", async () => {
    const CampaignEmptyState = (await import("@/components/campaign/CampaignEmptyState")).default;
    const { rerender } = render(
      <SmokeRouter>
        <CampaignEmptyState hasAccess type="campaign" />
      </SmokeRouter>,
    );
    expect(screen.getAllByText(/Get started/i)[0]).toBeInTheDocument();
    rerender(
      <SmokeRouter>
        <CampaignEmptyState hasAccess={false} type="number" />
      </SmokeRouter>,
    );
    expect(screen.getByText(/renting a number/i)).toBeInTheDocument();
  });
});

describe("app/components/campaign/CampaignList.tsx", () => {
  test("lists campaigns", async () => {
    const CampaignsList = (await import("@/components/campaign/CampaignList")).default;
    render(
      <SmokeRouter>
        <CampaignsList
          campaigns={[makeCampaign({ id: 1, title: "C1", status: "running" })]}
          userRole={"owner" as never}
          setCampaignsListOpen={noop}
        />
      </SmokeRouter>,
    );
    expect(screen.getByText("C1")).toBeInTheDocument();
  });
});

describe("app/components/campaign/home/CampaignHomeScreen/CampaignNav.tsx", () => {
  test("navigation links", async () => {
    const { NavigationLinks } = await import("@/components/campaign/home/CampaignHomeScreen/CampaignNav");
    render(
      <SmokeRouter>
        <NavigationLinks hasAccess data={makeCampaign({ type: "live_call" })} joinDisabled={null} />
      </SmokeRouter>,
    );
    expect(screen.getByText("Settings")).toBeInTheDocument();
    render(
      <SmokeRouter>
        <NavigationLinks hasAccess={false} data={makeCampaign()} joinDisabled="busy" />
      </SmokeRouter>,
    );
  });
});

describe("app/components/campaign/home/CampaignHomeScreen/CampaignInstructions.tsx", () => {
  test("blocks Join Campaign and exposes the reason", async () => {
    const { CampaignInstructions } = await import(
      "@/components/campaign/home/CampaignHomeScreen/CampaignInstructions"
    );
    render(
      <SmokeRouter>
        <CampaignInstructions
          campaignData={{}}
          totalCalls={0}
          expectedTotal={10}
          joinDisabled="Only campaign admins can join."
        />
      </SmokeRouter>,
    );

    expect(screen.queryByRole("link", { name: "Join Campaign" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join Campaign" })).toBeDisabled();
    expect(screen.getByText("Only campaign admins can join.")).toBeVisible();
  });
});

describe("app/components/campaign/settings/detailed/live/CampaignDetailed.Live.Switches.tsx", () => {
  test("household and dial type switches", async () => {
    const { DialTypeSwitch, HouseholdSwitch } = await import(
      "@/components/campaign/settings/detailed/live/CampaignDetailed.Live.Switches"
    );
    render(
      <HouseholdSwitch
        handleInputChange={handleInputChange}
        campaignData={{ group_household_queue: true }}
      />,
    );
    render(
      <DialTypeSwitch
        handleInputChange={handleInputChange}
        campaignData={{ dial_type: "predictive" }}
      />,
    );
    fireEvent.click(screen.getAllByRole("switch")[0]!);
    expect(handleInputChange).toHaveBeenCalled();
  });
});

describe("app/components/campaign/settings/basic/CampaignBasicInfo.Dates.tsx", () => {
  test("uses calling-hours wording for call campaigns", async () => {
    const SelectDates = (await import("@/components/campaign/settings/basic/CampaignBasicInfo.Dates")).default;
    render(
      <SelectDates
        campaignData={makeCampaign({ type: "live_call", schedule: null })}
        handleInputChange={handleInputChange}
      />,
    );
    expect(screen.getByText("Calling Hours")).toBeInTheDocument();
    expect(screen.getByText("No calling hours set")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Set Calling Hours" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Send Window")).not.toBeInTheDocument();
  });

  test("message campaign Apply persists sms_send_window, not schedule", async () => {
    const SelectDates = (await import("@/components/campaign/settings/basic/CampaignBasicInfo.Dates")).default;
    const onChange = vi.fn();
    render(
      <SelectDates
        campaignData={makeCampaign({ type: "message", schedule: null, sms_send_window: null })}
        handleInputChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Set Send Window" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Apply 09:00–17:00 local to Weekdays" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply Send Window" }));
    expect(onChange).toHaveBeenCalled();
    const [field, value] = onChange.mock.calls.at(-1)!;
    expect(field).toBe("sms_send_window");
    expect(typeof value).toBe("string");
    const parsed = JSON.parse(String(value));
    expect(parsed.monday.active).toBe(true);
  });

  test("call campaign Apply persists schedule", async () => {
    const SelectDates = (await import("@/components/campaign/settings/basic/CampaignBasicInfo.Dates")).default;
    const onChange = vi.fn();
    render(
      <SelectDates
        campaignData={makeCampaign({ type: "live_call", schedule: null })}
        handleInputChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Set Calling Hours" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Apply 09:00–17:00 local to Weekdays" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply Calling Hours" }));
    const [field] = onChange.mock.calls.at(-1)!;
    expect(field).toBe("schedule");
  });
});

describe("app/components/campaign/settings/basic/CampaignBasicInfo.SelectStatus.tsx", () => {
  test("status select", async () => {
    const SelectStatus = (await import("@/components/campaign/settings/basic/CampaignBasicInfo.SelectStatus")).default;
    render(
      <SelectStatus handleInputChange={handleInputChange} campaignData={{ status: "draft" }} />,
    );
    expect(screen.getByText("Campaign Status")).toBeInTheDocument();
  });
});

describe("app/components/campaign/settings/detailed/CampaignDetailed.ActivateButtons.tsx", () => {
  test("schedule button", async () => {
    const ActivateButtons = (await import("@/components/campaign/settings/detailed/CampaignDetailed.ActivateButtons")).default;
    const handleScheduleButton = vi.fn();
    render(
      <ActivateButtons
        joinDisabled={null}
        scheduleDisabled={false}
        isBusy={false}
        handleScheduleButton={handleScheduleButton}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Schedule/i }));
    expect(handleScheduleButton).toHaveBeenCalled();
    render(
      <ActivateButtons
        joinDisabled="x"
        scheduleDisabled="not ready"
        isBusy
        handleScheduleButton={handleScheduleButton}
      />,
    );
  });
});

describe("app/components/campaign/settings/detailed/CampaignDetailed.tsx", () => {
  test("shows Send Now and Schedule Campaign blocker reasons", async () => {
    const { CampaignTypeSpecificSettings } = await import(
      "@/components/campaign/settings/detailed/CampaignDetailed"
    );
    render(
      <CampaignTypeSpecificSettings
        campaignData={makeCampaign({
          type: "message",
          caller_id: "+15551234567",
          sms_send_mode: "from_number",
        })}
        handleInputChange={vi.fn()}
        mediaData={[]}
        scripts={[]}
        handleActivateButton={vi.fn()}
        handleScheduleButton={vi.fn()}
        details={{
          workspace: "ws-1",
          campaign_id: 1,
          body_text: "",
          message_media: [],
        } as never}
        mediaLinks={[]}
        isChanged={false}
        isBusy={false}
        joinDisabled="Message content or media is required."
        scheduleDisabled="Calling hours are required."
        readinessIssues={["Message content or media is required."]}
        surveys={[]}
        queueCount={10}
        phoneNumbers={[]}
        outboundEstimateInputs={{
          portalConfig: {
            sendMode: "from_number",
            messagingServiceSid: null,
            smsSenderClass: "unknown",
            trafficClass: "unknown",
            throughputProduct: "none",
            smsTargetMps: 1,
            parallelDispatchEnabled: false,
          } as never,
          syncSnapshot: { phoneNumberCount: 0 } as never,
        }}
        handleNavigate={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Send Now" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Schedule Campaign" })).toBeDisabled();
    expect(screen.getByText("Message content or media is required.")).toBeVisible();
    expect(screen.getByText("Calling hours are required.")).toBeVisible();
  });
});

describe("app/components/phone-numbers/NumberPurchase.constants.ts", () => {
  test("emptyMessageForMode", async () => {
    const mod = await import("@/components/phone-numbers/NumberPurchase.constants");
    expect(mod.emptyMessageForMode("areaCode", "416")).toContain("416");
    expect(mod.SEARCH_MODE_LABELS.province).toBeTruthy();
  });
});
