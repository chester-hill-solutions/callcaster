import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { CallLogTable } from "@/components/calls/CallLogTable";
import type { CallLogRow } from "@/lib/call-log.server";

function row(overrides: Partial<CallLogRow> = {}): CallLogRow {
  return {
    sid: "CA1",
    dateCreated: "2026-09-20T00:00:00.000Z",
    callcasterNumber: "+15550000000",
    otherNumber: "+15551111111",
    direction: "outbound",
    disposition: null,
    agentName: null,
    agentUserId: null,
    recordingUrl: null,
    recordingPlaybackUrl: null,
    status: "completed",
    ...overrides,
  };
}

function renderTable(rows: CallLogRow[]) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <CallLogTable
            rows={rows}
            workspaceId="w1"
            workspaceNumbers={[]}
            agents={[]}
            sorting={{ sortKey: "date_created", sortDirection: "desc" }}
            filters={{
              callcasterNumber: "",
              otherNumber: "",
              direction: "all",
              disposition: "",
              agentUserId: "",
            }}
            pagination={{
              currentPage: 1,
              totalPages: 1,
              totalCount: rows.length,
              pageSize: 25,
            }}
          />
        ),
      },
    ],
    { initialEntries: ["/"] },
  );
  render(<RouterProvider router={router} />);
}

describe("CallLogTable voicemail cell (#1844)", () => {
  test("plays the stored copy in-app when a signed playback URL exists", () => {
    renderTable([row({ recordingPlaybackUrl: "https://signed.example/rec.mp3" })]);

    const audio = document.querySelector("audio");
    expect(audio).not.toBeNull();
    expect(audio?.getAttribute("src")).toBe("https://signed.example/rec.mp3");
    // The external Twilio link is not used when a stored copy exists.
    expect(screen.queryByRole("link", { name: "Listen" })).toBeNull();
  });

  test("falls back to the Twilio link when there is no stored copy", () => {
    renderTable([row({ recordingUrl: "https://api.twilio.com/rec" })]);

    expect(screen.getByRole("link", { name: "Listen" })).toHaveAttribute(
      "href",
      "https://api.twilio.com/rec",
    );
    expect(document.querySelector("audio")).toBeNull();
  });

  test("shows the Voicemails link when the call has no recording", () => {
    renderTable([row()]);

    expect(screen.queryByRole("link", { name: "Listen" })).toBeNull();
    expect(document.querySelector("audio")).toBeNull();
    expect(screen.getByRole("link", { name: "Voicemails" })).toBeInTheDocument();
  });
});
