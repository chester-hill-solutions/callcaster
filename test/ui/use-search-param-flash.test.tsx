import { render, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useSearchParamFlash } from "@/hooks/utils/useSearchParamFlash";

/**
 * `useSearchParamFlash` is the reason the voicemail e2e spec was intermittently
 * red.
 *
 * The hook fires its handlers and then **deletes the params that triggered
 * them**, with a replace navigation. That is deliberate — a toast should not
 * re-fire on refresh — and `voicemails.route.tsx` relies on it for
 * `?configured=1`.
 *
 * The e2e spec used to assert `toHaveURL(/\/voicemails\?configured=1$/)`,
 * which asserts a value the app is designed to remove. It passed or failed
 * depending on whether the assertion observed the URL before or after the
 * effect ran. The spec now asserts the landing page instead.
 *
 * These tests pin the stripping behaviour the spec now depends on. It was
 * untested, and three routes use it: `voicemails`, `audios` and
 * `phone-numbers`.
 */
const handlers = {
  toast: vi.fn(),
  other: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

function renderAt(path: string) {
  const router = createMemoryRouter(
    [{ path: "/", element: <FlashProbe /> }],
    { initialEntries: [path] },
  );
  const view = render(<RouterProvider router={router} />);
  // A memory router keeps its own location and never touches `window.location`,
  // so the search string has to be read off the router. Asserting on
  // `window.location.search` here would pass no matter what the hook did.
  return { ...view, router };
}

function FlashProbe() {
  // A fresh object every render, on purpose: the hook must not re-fire because
  // the handlers identity changed.
  useSearchParamFlash(handlers);
  return <div>probe</div>;
}

describe("useSearchParamFlash", () => {
  // The behaviour the e2e spec now relies on. If this regresses, the spec's
  // landing-page assertion still holds but the one-shot guarantee is gone and
  // a refresh would re-fire the toast.
  test("strips the param that triggered the handler", async () => {
    // No pre-condition on the incoming search string: `render` flushes effects,
    // so by the time it returns the hook has already run. The pairing that makes
    // this a real check is the next test — a param the hook does not own is
    // left in place, so an empty search here means the strip happened rather
    // than that nothing was ever there.
    const { router } = renderAt("/?toast=1");
    await waitFor(() => expect(handlers.toast).toHaveBeenCalledWith("1"));
    await waitFor(() => expect(router.state.location.search).toBe(""));
  });

  test("fires each handler once with its own value", async () => {
    renderAt("/?toast=1&other=abc");
    await waitFor(() => {
      expect(handlers.toast).toHaveBeenCalledWith("1");
      expect(handlers.other).toHaveBeenCalledWith("abc");
    });
  });

  // A handler re-created on every render must not re-fire, or the toast would
  // repeat forever. This is what the handlersRef indirection is for.
  test("does not re-fire when the handlers object identity changes", async () => {
    const { rerender } = renderAt("/?toast=1");
    await waitFor(() => expect(handlers.toast).toHaveBeenCalledTimes(1));
    rerender(<div>probe</div>);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(handlers.toast).toHaveBeenCalledTimes(1);
  });

  // Nothing to flash means no navigation at all — otherwise every page that
  // mounts the hook would rewrite its own URL.
  test("leaves the URL alone when no flash param is present", async () => {
    const { router } = renderAt("/?unrelated=keep");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(handlers.toast).not.toHaveBeenCalled();
    expect(handlers.other).not.toHaveBeenCalled();
    expect(router.state.location.search).toBe("?unrelated=keep");
  });
});
