import { useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { MessageSettings } from "@/components/campaign/settings/MessageSettings";

const boundary = vi.hoisted(() => ({ submissions: new Array<FormData>() }));

vi.mock("react-router", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router")>();
  return {
    ...original,
    useFetcher: (...args: Parameters<typeof original.useFetcher>) => {
      const fetcher = original.useFetcher(...args);
      return {
        ...fetcher,
        submit: (...submitArgs: Parameters<typeof fetcher.submit>) => {
          const [target] = submitArgs;
          if (target instanceof FormData) boundary.submissions.push(target);
          return fetcher.submit(...submitArgs);
        },
      };
    },
  };
});

type MediaReply = {
  success: boolean;
  error?: string;
  campaignUpdate?: Array<{ message_media: string[] }>;
  uploadedFileName?: string;
  removedFileName?: string;
  url?: string;
};

const routers = new Set<ReturnType<typeof createMemoryRouter>>();

afterEach(() => {
  for (const router of routers) router.dispose();
  routers.clear();
  boundary.submissions.length = 0;
});

function renderMedia(
  initialNames = ["first.png", "second.png"],
  respond: (success: MediaReply) => MediaReply | Promise<MediaReply> = (
    success,
  ) => success,
) {
  const initialLinks = initialNames.map(
    (name) => `https://fixture.test/${name}`,
  );
  const requests: Array<{ method: string; form: FormData }> = [];
  let savedNames = [...initialNames];

  function Editor() {
    const [names, setNames] = useState(initialNames);
    return (
      <MessageSettings
        mediaLinks={initialLinks}
        details={{
          workspace: "workspace-one",
          campaign_id: 121,
          body_text: "Hello",
          message_media: names,
        }}
        onChange={(field, value) => {
          if (
            field === "message_media" &&
            Array.isArray(value) &&
            value.every((name): name is string => typeof name === "string")
          ) {
            setNames(value);
          }
        }}
      />
    );
  }

  const router = createMemoryRouter([
    { path: "/", Component: Editor },
    {
      path: "/api/message_media",
      action: async ({ request }) => {
        const form = await request.formData();
        requests.push({ method: request.method, form });
        const fileName = String(form.get("fileName"));
        const uploadedName = `stored-${fileName}`;
        const nextNames =
          request.method === "POST"
            ? [...savedNames, uploadedName]
            : savedNames.filter((name) => name !== fileName);
        const success: MediaReply = {
          success: true,
          campaignUpdate: [{ message_media: nextNames }],
          ...(request.method === "POST"
            ? {
                uploadedFileName: uploadedName,
                url: `https://fixture.test/${uploadedName}`,
              }
            : { removedFileName: fileName }),
        };
        const result = await respond(success);
        if (result.success) savedNames = nextNames;
        return result;
      },
    },
  ]);
  routers.add(router);
  const view = render(<RouterProvider router={router} />);
  const input =
    view.container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("Expected the attachment file input.");
  return { requests, input };
}

function deferredReply() {
  let resolve: (reply: MediaReply) => void = () => {
    throw new Error("Reply is not ready.");
  };
  const promise = new Promise<MediaReply>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function uploadedText(form: FormData) {
  const image = form.get("image");
  if (image === null || typeof image === "string")
    throw new Error("Expected multipart file bytes.");
  expect(image.name).toBe("photo.png");
  expect(image.type).toBe("image/png");
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(image);
  });
}

describe("campaign attachment actions (#2656)", () => {
  test("renders named kit actions for valid attachments without hover", async () => {
    const user = userEvent.setup();
    renderMedia(["first.png", "", "third.png"]);
    const first = screen.getByRole("button", { name: "Remove attachment 1" });
    const third = screen.getByRole("button", { name: "Remove attachment 3" });
    expect(
      screen.queryByRole("button", { name: "Remove attachment 2" }),
    ).toBeNull();
    expect(
      screen.getAllByRole("button", { name: /^Remove attachment/ }),
    ).toHaveLength(2);
    for (const button of [
      first,
      third,
      screen.getByRole("button", { name: "Add image" }),
    ]) {
      expect(button).toBeVisible();
      expect(button).toHaveAttribute("data-slot", "button");
      expect(button.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }
    await user.tab();
    expect(first).toHaveFocus();
    await user.tab();
    expect(third).toHaveFocus();
  });

  test.each(["{Enter}", " "])(
    "Add image opens the file chooser with %s",
    async (key) => {
      const user = userEvent.setup();
      const { input, requests } = renderMedia();
      const openChooser = vi.spyOn(input, "click");
      screen.getByRole("button", { name: "Add image" }).focus();
      await user.keyboard(key);
      expect(openChooser).toHaveBeenCalledTimes(1);
      expect(requests).toHaveLength(0);
    },
  );

  test("uploads multipart file bytes and updates the preview and MMS estimate after success", async () => {
    const user = userEvent.setup();
    const { input, requests } = renderMedia([]);
    expect(screen.getByText("≈ 2 credits per recipient")).toBeVisible();
    await user.upload(
      input,
      new File(["pixel-bytes"], "photo.png", { type: "image/png" }),
    );
    await screen.findByAltText("Campaign media 1");
    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request.method).toBe("POST");
    expect(request.form.get("workspaceId")).toBe("workspace-one");
    expect(request.form.get("campaignId")).toBe("121");
    expect(request.form.get("fileName")).toBe("photo.png");
    expect(await uploadedText(boundary.submissions[0])).toBe("pixel-bytes");
    expect(screen.getByAltText("Campaign media 1")).toHaveAttribute(
      "src",
      "https://fixture.test/stored-photo.png",
    );
    expect(screen.getByText("≈ 4 credits per recipient (MMS)")).toBeVisible();
  });

  test("keyboard Remove submits the selected attachment and keeps other previews", async () => {
    const user = userEvent.setup();
    const { requests } = renderMedia();
    screen.getByRole("button", { name: "Remove attachment 2" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.queryByAltText("Campaign media 2")).toBeNull(),
    );
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].form.get("fileName")).toBe("second.png");
    expect(requests[0].form.get("workspaceId")).toBe("workspace-one");
    expect(requests[0].form.get("campaignId")).toBe("121");
    expect(screen.getByAltText("Campaign media 1")).toHaveAttribute(
      "src",
      "https://fixture.test/first.png",
    );
    expect(screen.getByText("≈ 4 credits per recipient (MMS)")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Remove attachment 1" }),
    );
    await waitFor(() => expect(screen.queryByRole("img")).toBeNull());
    expect(screen.getByText("≈ 2 credits per recipient")).toBeVisible();
  });

  test("locks every media action while pending and retains previews for failure and retry", async () => {
    const user = userEvent.setup();
    const delayed = deferredReply();
    let attempts = 0;
    const { input, requests } = renderMedia(undefined, (success) =>
      ++attempts === 1 ? delayed.promise : success,
    );
    await user.click(
      screen.getByRole("button", { name: "Remove attachment 2" }),
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    for (const button of screen.getAllByRole("button", {
      name: /^(Add image|Remove attachment)/,
    }))
      expect(button).toBeDisabled();
    expect(input).toBeDisabled();
    expect(screen.getByAltText("Campaign media 2")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Add image" }));
    await user.click(
      screen.getByRole("button", { name: "Remove attachment 1" }),
    );
    expect(requests).toHaveLength(1);
    await act(async () => {
      delayed.resolve({ success: false, error: "Fixture rejection" });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Message media could not be updated",
    );
    expect(screen.getByAltText("Campaign media 1")).toBeVisible();
    expect(screen.getByAltText("Campaign media 2")).toBeVisible();
    expect(input).toBeEnabled();
    await user.click(
      screen.getByRole("button", { name: "Remove attachment 2" }),
    );
    await waitFor(() =>
      expect(screen.queryByAltText("Campaign media 2")).toBeNull(),
    );
    expect(requests).toHaveLength(2);
    expect(requests[1].form.get("fileName")).toBe("second.png");
    expect(screen.getByAltText("Campaign media 1")).toHaveAttribute(
      "src",
      "https://fixture.test/first.png",
    );
  });

  test("can choose the same file again after a failed upload", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const { input, requests } = renderMedia([], (success) =>
      ++attempts === 1
        ? { success: false, error: "Fixture rejection" }
        : success,
    );
    const photo = new File(["pixel-bytes"], "photo.png", { type: "image/png" });
    await user.click(screen.getByRole("button", { name: "Add image" }));
    await user.upload(input, photo);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Message media could not be updated",
    );
    expect(screen.queryByRole("img")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Add image" }));
    await user.upload(input, photo);
    await screen.findByAltText("Campaign media 1");
    expect(requests).toHaveLength(2);
    expect(await uploadedText(boundary.submissions[0])).toBe("pixel-bytes");
    expect(await uploadedText(boundary.submissions[1])).toBe("pixel-bytes");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("≈ 4 credits per recipient (MMS)")).toBeVisible();
  });
});
