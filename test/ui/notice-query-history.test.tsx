import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { createMemoryRouter, Link, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { QueryParamBanner } from "@/components/shared/QueryParamBanner";
import { useSearchParamFlash } from "@/hooks/utils/useSearchParamFlash";

const routers: ReturnType<typeof createMemoryRouter>[] = [];
const variants = {
  saved: {
    title: "Saved",
    description: "Your changes were saved",
    variant: "success" as const,
  },
};

afterEach(() => {
  for (const router of routers.splice(0)) router.dispose();
});

function renderHistory(element: ReactNode, current: string) {
  const router = createMemoryRouter(
    [
      { path: "/previous", element: <p>Previous page</p> },
      { path: "/current", element },
    ],
    { initialEntries: ["/previous?keep=earlier", current], initialIndex: 1 },
  );
  routers.push(router);
  render(<RouterProvider router={router} />);
  return router;
}

describe("notice query history", () => {
  test("Back skips a dismissed banner and Forward keeps its unrelated parameters", async () => {
    const user = userEvent.setup();
    const router = renderHistory(
      <QueryParamBanner
        param="status"
        variants={variants}
        clearParams={["detail"]}
      />,
      "/current?status=saved&detail=one&detail=two&filter=active&filter=paused&page=3",
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your changes were saved",
    );
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(router.state.location.search).toBe(
      "?filter=active&filter=paused&page=3",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe("/previous");
    expect(router.state.location.search).toBe("?keep=earlier");
    expect(screen.getByText("Previous page")).toBeInTheDocument();

    await act(() => router.navigate(1));
    expect(router.state.location.pathname).toBe("/current");
    expect(router.state.location.search).toBe(
      "?filter=active&filter=paused&page=3",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("dismissal clears only its own parameter when no companions are configured", async () => {
    const user = userEvent.setup();
    const router = renderHistory(
      <QueryParamBanner param="status" variants={variants} />,
      "/current?status=saved&detail=keep&q=two+words",
    );

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(router.state.location.search).toBe("?detail=keep&q=two+words");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe("/previous");
  });

  test.each(["/current?status=unknown&detail=keep", "/current?detail=keep"])(
    "an unrecognized or absent notice leaves history unchanged: %s",
    async (path) => {
      const router = renderHistory(
        <QueryParamBanner param="status" variants={variants} />,
        path,
      );
      const originalLocation = router.state.location;

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Dismiss" }),
      ).not.toBeInTheDocument();
      expect(router.state.location).toBe(originalLocation);
      await act(() => router.navigate(-1));
      expect(router.state.location.pathname).toBe("/previous");
      await act(() => router.navigate(1));
      expect(
        router.state.location.pathname + router.state.location.search,
      ).toBe(path);
    },
  );

  test("a later user filter navigation remains a separate history entry", async () => {
    const user = userEvent.setup();
    const router = renderHistory(
      <>
        <QueryParamBanner param="status" variants={variants} />
        <Link to="?filter=paused">Paused contacts</Link>
      </>,
      "/current?status=saved&filter=active",
    );

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    await user.click(screen.getByRole("link", { name: "Paused contacts" }));
    expect(router.state.location.search).toBe("?filter=paused");
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe("/current");
    expect(router.state.location.search).toBe("?filter=active");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe("/previous");
  });

  test("active flash clears replace history and do not replay after Back and Forward", async () => {
    const saved = vi.fn();
    const warning = vi.fn();
    function FlashPage() {
      useSearchParamFlash({ saved, warning });
      return <p>Flash page</p>;
    }
    const router = renderHistory(
      <FlashPage />,
      "/current?saved=1&warning=sender&filter=active&filter=paused&page=3",
    );

    await waitFor(() =>
      expect(router.state.location.search).toBe(
        "?filter=active&filter=paused&page=3",
      ),
    );
    expect(saved).toHaveBeenCalledExactlyOnceWith("1");
    expect(warning).toHaveBeenCalledExactlyOnceWith("sender");
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe("/previous");
    await act(() => router.navigate(1));
    expect(screen.getByText("Flash page")).toBeInTheDocument();
    expect(router.state.location.search).toBe(
      "?filter=active&filter=paused&page=3",
    );
    expect(saved).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledTimes(1);
  });
});
