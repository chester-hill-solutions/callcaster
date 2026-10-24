import { afterEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";

vi.mock("../../app/routes/workspaces+/$id/audios.loader.server", () => ({
  loader: vi.fn(),
}));
vi.mock(
  "../../app/routes/workspaces+/$id/audios/$fileName.edit.loader.server",
  () => ({
    loader: vi.fn(),
  }),
);
vi.mock(
  "../../app/routes/workspaces+/$id/audios/$fileName.edit.action.server",
  () => ({
    action: vi.fn(),
  }),
);
vi.mock("@/components/file-assets/AudioClipEditor", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/components/file-assets/AudioClipEditor")
  >()),
  AudioClipEditor: () => <p>Audio clip controls</p>,
}));

import WorkspaceAudiosPage from "../../app/routes/workspaces+/$id/audios.route";
import EditAudioPage from "../../app/routes/workspaces+/$id/audios/$fileName.edit.route";

let router: ReturnType<typeof createMemoryRouter> | undefined;

afterEach(() => {
  router?.dispose();
  router = undefined;
});

const editorStates = [
  {
    name: "normal editor",
    data: {
      fileName: "greeting one.mp3",
      src: "https://audio.example/greeting.mp3",
      metadata: null,
      usage: [],
      error: null,
    },
  },
  {
    name: "unavailable audio recovery",
    data: {
      fileName: null,
      src: null,
      metadata: null,
      usage: [],
      error: "Audio not found",
    },
  },
];

describe.each(["workspace-one", "workspace-two"])(
  "audio editor return navigation in %s (#2642)",
  (workspaceId) => {
    test.each(editorStates)(
      "$name returns to its library with normal Back history",
      async ({ data }) => {
        const user = userEvent.setup();
        const campaignsPath = `/workspaces/${workspaceId}/campaigns`;
        const libraryPath = `/workspaces/${workspaceId}/audios`;
        const editorPath = `${libraryPath}/greeting%20one.mp3/edit`;

        const pageRouter = createMemoryRouter(
          [
            {
              path: "/workspaces/:id",
              Component: Outlet,
              HydrateFallback: () => null,
              children: [
                {
                  path: "campaigns",
                  Component: () => <h1>Campaign list</h1>,
                },
                {
                  path: "audios",
                  Component: WorkspaceAudiosPage,
                  loader: () => ({
                    audioMedia: [],
                    workspace: { name: workspaceId },
                    error: "No Audio in Workspace",
                    userRole: "owner",
                  }),
                  children: [
                    {
                      path: ":fileName/edit",
                      Component: EditAudioPage,
                      loader: () => data,
                    },
                  ],
                },
              ],
            },
          ],
          { initialEntries: [campaignsPath, editorPath], initialIndex: 1 },
        );
        router = pageRouter;
        render(<RouterProvider router={pageRouter} />);

        const returnLink = await screen.findByRole("link", {
          name: "Back to audio library",
        });
        await user.click(returnLink);

        await waitFor(() =>
          expect(pageRouter.state.location.pathname).toBe(libraryPath),
        );
        expect(
          await screen.findByRole("heading", { name: "Audio Library" }),
        ).toBeInTheDocument();
        expect(pageRouter.state.historyAction).toBe("PUSH");

        await act(async () => {
          await pageRouter.navigate(-1);
        });
        expect(
          await screen.findByRole("link", { name: "Back to audio library" }),
        ).toBeInTheDocument();
        expect(pageRouter.state.location.pathname).toBe(editorPath);
        expect(pageRouter.state.historyAction).toBe("POP");

        await act(async () => {
          await pageRouter.navigate(-1);
        });
        expect(
          await screen.findByRole("heading", { name: "Campaign list" }),
        ).toBeInTheDocument();
        expect(pageRouter.state.location.pathname).toBe(campaignsPath);
      },
    );
  },
);
