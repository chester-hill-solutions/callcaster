import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { noop, SmokeRouter, DataSmokeRouter } from "./_helpers/component-smoke";

vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: vi.fn(), theme: "light", resolvedTheme: "light" }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("app/components/shared/AuthCard.tsx", () => {
  test("renders title, description, and children", async () => {
    const { AuthCard } = await import("@/components/shared/AuthCard");
    render(
      <AuthCard title="Sign in" description="Welcome back">
        <button type="button">Go</button>
      </AuthCard>,
    );
    expect(screen.getByText("Sign in")).toBeInTheDocument();
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });
});

describe("app/components/shared/BrandedCard.tsx", () => {
  test("renders branded card sections", async () => {
    const {
      BrandedCard,
      BrandedCardActions,
      BrandedCardContent,
      BrandedCardTitle,
    } = await import("@/components/shared/BrandedCard");
    render(
      <BrandedCard>
        <BrandedCardTitle>Title</BrandedCardTitle>
        <BrandedCardContent>Body</BrandedCardContent>
        <BrandedCardActions>
          <button type="button">Save</button>
        </BrandedCardActions>
      </BrandedCard>,
    );
    expect(screen.getByText("Title")).toBeInTheDocument();
  });
});

describe("app/components/shared/ErrorBoundary.tsx", () => {
  test("renders children when no error", async () => {
    const { ErrorBoundary } = await import("@/components/shared/ErrorBoundary");
    render(
      <ErrorBoundary>
        <span>ok</span>
      </ErrorBoundary>,
    );
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  test("shows fallback on child error", async () => {
    const { ErrorBoundary } = await import("@/components/shared/ErrorBoundary");
    const boundary = new ErrorBoundary({
      children: <span>ok</span>,
      fallback: <div>fallback</div>,
    });
    boundary.state = ErrorBoundary.getDerivedStateFromError(new Error("boom"));

    render(<>{boundary.render()}</>);
    expect(screen.getByText("fallback")).toBeInTheDocument();
  });
});

describe("app/components/shared/InfoPopover.tsx", () => {
  test("renders trigger and content", async () => {
    const InfoPopover = (await import("@/components/shared/InfoPopover")).default;
    render(<InfoPopover tooltip="Help text" />);
    expect(document.querySelector("svg")).toBeTruthy();
  });
});

describe("app/components/shared/mode-toggle.tsx", () => {
  test("renders theme toggle", async () => {
    const { ModeToggle } = await import("@/components/shared/mode-toggle");
    render(<ModeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /toggle theme/i }));
  });
});

describe("app/components/shared/SaveBar.tsx", () => {
  test("save and reset actions", async () => {
    const { SaveBar } = await import("@/components/shared/SaveBar");
    const onSave = vi.fn();
    const onReset = vi.fn();
    render(
      <SaveBar isChanged onSave={onSave} onReset={onReset} isSaving={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(onSave).toHaveBeenCalled();
    expect(onReset).toHaveBeenCalled();
    render(<SaveBar isChanged={false} onSave={onSave} onReset={onReset} isSaving />);
  });
});

describe("app/components/shared/Section.tsx", () => {
  test("section and header", async () => {
    const { Section, SectionHeader } = await import("@/components/shared/Section");
    render(
      <Section>
        <SectionHeader title="T" description="D" actions={<button type="button">A</button>} branded />
      </Section>,
    );
    expect(screen.getByText("T")).toBeInTheDocument();
    render(
      <SectionHeader title="Only" />,
    );
  });
});

describe("app/components/shared/TablePagination.tsx", () => {
  test("pagination controls", async () => {
    const TablePagination = (await import("@/components/shared/TablePagination")).default;
    const onPageChange = vi.fn();
    render(
      <TablePagination
        currentPage={2}
        totalPages={5}
        pageSize={25}
        totalCount={100}
        showSummary
        onPageChange={onPageChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Go to next page"));
    expect(onPageChange).toHaveBeenCalled();
  });
});

describe("app/components/shared/TransparentBGImage.tsx", () => {
  test("renders background image wrapper", async () => {
    const BgImage = (await import("@/components/shared/TransparentBGImage")).default;
    render(
      <BgImage image="/Hero-1.png" opacity={0.2}>
        <span>child</span>
      </BgImage>,
    );
    expect(screen.getByText("child")).toBeInTheDocument();
  });
});

describe("app/components/invite/welcome", () => {
  test("invite field components render", async () => {
    const { EmailField } = await import("@/components/invite/welcome/EmailField");
    const { ErrorAlert } = await import("@/components/invite/welcome/ErrorAlert");
    const { ExistingUserInvites } = await import("@/components/invite/welcome/ExistingUserInvites");
    const { InviteCheckbox } = await import("@/components/invite/welcome/InviteCheckbox");
    const { NameFields } = await import("@/components/invite/welcome/NameFields");
    const { NewUserSignup } = await import("@/components/invite/welcome/NewUserSignUp");
    const { PasswordFields } = await import("@/components/invite/welcome/PasswordFields");

    render(
      <DataSmokeRouter>
        <EmailField email="a@b.com" />
      </DataSmokeRouter>,
    );
    render(
      <DataSmokeRouter>
        <ErrorAlert error={{ message: "bad" }} />
      </DataSmokeRouter>,
    );
    render(
      <DataSmokeRouter>
        <ErrorAlert error={{ message: "Email link is invalid or has expired" }} />
      </DataSmokeRouter>,
    );
    render(
      <DataSmokeRouter>
        <ExistingUserInvites invites={[]} state="idle" />
      </DataSmokeRouter>,
    );
    render(
      <DataSmokeRouter>
        <InviteCheckbox
          invite={{
            id: "i1",
            created_at: new Date().toISOString(),
            isNew: true,
            role: "member",
            user_id: "u1",
            workspace: { id: "w1", name: "WS" },
          }}
        />
      </DataSmokeRouter>,
    );
    render(
      <DataSmokeRouter>
        <NameFields />
      </DataSmokeRouter>,
    );
    render(
      <DataSmokeRouter>
        <NewUserSignup email="a@b.com" state="idle" />
      </DataSmokeRouter>,
    );
    render(
      <DataSmokeRouter>
        <PasswordFields />
      </DataSmokeRouter>,
    );
  });
});

describe("app/components/layout/Navbar.tsx", () => {
  test("signed-in navbar with workspaces", async () => {
    const Navbar = (await import("@/components/layout/Navbar")).default;
    const { NavButton } = await import("@/components/layout/Navbar");
    render(
      <SmokeRouter>
        <NavButton to="/">Home</NavButton>
        <Navbar
          handleSignOut={async () => ({ success: null, error: null })}
          workspaces={[{ id: "w1", name: "WS" } as never]}
          isSignedIn
          user={{
            id: "u1",
            username: "user",
            workspace_invite: [],
          } as never}
          params={{ id: "w1" }}
        />
      </SmokeRouter>,
    );
    expect(screen.getByText(/Home|WS|user/i)).toBeTruthy();
  });

  test("signed-out navbar", async () => {
    const Navbar = (await import("@/components/layout/Navbar")).default;
    render(
      <SmokeRouter>
        <Navbar
          handleSignOut={async () => ({ success: null, error: null })}
          workspaces={null}
          isSignedIn={false}
          user={null}
          params={{}}
        />
      </SmokeRouter>,
    );
  });
});

describe("app/components/layout/Navbar.MobileMenu.tsx", () => {
  test("mobile menu toggles", async () => {
    const { MobileMenu } = await import("@/components/layout/Navbar.MobileMenu");
    render(
      <SmokeRouter>
        <MobileMenu
          isSignedIn
          user={{ id: "u1", username: "user", workspace_invite: [] } as never}
          handleSignOut={async () => ({ success: null, error: null })}
          onClose={noop}
        />
      </SmokeRouter>,
    );
    const menuBtn = screen.getAllByRole("button")[0];
    fireEvent.click(menuBtn);
  });
});

describe("app/components/other-services/ServiceCard.tsx", () => {
  test("renders title and description", async () => {
    const ServiceCard = (await import("@/components/other-services/ServiceCard")).default;
    render(<ServiceCard title="T" description="D" />);
    expect(screen.getByText("T")).toBeInTheDocument();
  });
});

describe("app/components/file-assets/columns.tsx", () => {
  test("column defs render cells", async () => {
    const { mediaColumns } = await import("@/components/file-assets/columns");
    expect(mediaColumns.length).toBeGreaterThan(0);
    const row = {
      getValue: (k: string) =>
        k === "created_at"
          ? new Date().toISOString()
          : k === "signedUrl"
            ? "https://cdn.example/a.mp3"
            : "f.mp3",
    };
    for (const col of mediaColumns) {
      if (col.cell && typeof col.cell === "function") {
        render(
          <>
            {(col.cell as (ctx: { row: typeof row }) => React.ReactNode)({ row })}
          </>,
        );
      }
    }
  });
});
