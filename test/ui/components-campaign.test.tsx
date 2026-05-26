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
    NavLink: ({ children, to, ...rest }: any) => (
      <a href={String(to)} {...rest}>
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

describe("app/components/phone-numbers/NumberPurchase.constants.ts", () => {
  test("emptyMessageForMode", async () => {
    const mod = await import("@/components/phone-numbers/NumberPurchase.constants");
    expect(mod.emptyMessageForMode("areaCode", "416")).toContain("416");
    expect(mod.SEARCH_MODE_LABELS.province).toBeTruthy();
  });
});
