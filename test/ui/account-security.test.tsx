import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../../app/routes/account.security.loader.server", () => ({
  loader: vi.fn(),
  action: vi.fn(),
}));

import AccountSecurity from "../../app/routes/account.security";

const baseLoader = {
  twoFactorAvailable: true,
  privileged: true,
  twoFactorEnabled: false,
  enrollRequired: false,
  next: null,
  privilegedRoles: ["owner", "admin"],
};

async function renderPage(loaderData = baseLoader) {
  const router = createMemoryRouter(
    [
      {
        path: "/account/security",
        Component: AccountSecurity,
        loader: () => loaderData,
        action: () => ({
          step: "verify",
          totpURI: "otpauth://totp/CallCaster:me?secret=AAAABBBB",
          backupCodes: ["1111AAAA", "2222BBBB"],
        }),
      },
    ],
    { initialEntries: ["/account/security"] },
  );
  render(<RouterProvider router={router} />);
  await screen.findByText("Not enabled");
  return router;
}

describe("Account security (MFA enrollment polish, #1316)", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("shows the 2FA status as a top-right badge", async () => {
    await renderPage();
    expect(screen.getByText("Not enabled")).toBeTruthy();
  });

  test("the password step advances with a right-aligned Next button", async () => {
    await renderPage();
    const next = await screen.findByRole("button", { name: "Next" });
    expect(next.className).toContain("ml-auto");
  });

  test("copy buttons flip to a checkmark and copy the secret + backup codes", async () => {
    const router = await renderPage();
    await router.navigate("/account/security", {
      formMethod: "POST",
      formData: new FormData(),
    });

    const secret = await screen.findByRole("button", { name: "Copy secret" });
    fireEvent.click(secret);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "otpauth://totp/CallCaster:me?secret=AAAABBBB",
    );
    expect(await screen.findByRole("button", { name: "secret copied" })).toBeTruthy();

    const codes = screen.getByRole("button", { name: "Copy backup codes" });
    fireEvent.click(codes);
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith("1111AAAA\n2222BBBB");
    expect(screen.getByText(/Save this in a secure place/)).toBeTruthy();
  });
});