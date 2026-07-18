import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import {
  WorkspaceResourceEmptyState,
  WorkspaceResourceListShell,
} from "@/components/workspace/WorkspaceResourceListShell";

describe("WorkspaceResourceListShell", () => {
  test("renders a flat empty state without Card chrome", () => {
    const { container } = render(
      <WorkspaceResourceListShell
        title="Scripts"
        isEmpty
        emptyMessage="No scripts yet"
        emptyDescription="Create a script to get started."
        addAction={<button type="button">New script</button>}
      />,
    );

    expect(screen.getByRole("heading", { name: "Scripts" })).toBeInTheDocument();
    expect(
      screen.getByTestId("workspace-resource-empty-state"),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No scripts yet" })).toBeInTheDocument();
    expect(screen.getByText("Create a script to get started.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New script" })).toBeInTheDocument();
    expect(container.querySelector("[data-slot='card']")).toBeNull();
    expect(container.querySelector(".rounded-lg.border")).toBeNull();
  });

  test("shows children and header action when the list is populated", () => {
    render(
      <WorkspaceResourceListShell
        title="Scripts"
        isEmpty={false}
        emptyMessage="No scripts yet"
        addAction={<button type="button">New script</button>}
      >
        <p>Script row</p>
      </WorkspaceResourceListShell>,
    );

    expect(screen.getByText("Script row")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New script" })).toBeInTheDocument();
    expect(screen.queryByTestId("workspace-resource-empty-state")).toBeNull();
  });
});

describe("WorkspaceResourceEmptyState", () => {
  test("can be reused outside the list shell", () => {
    render(
      <WorkspaceResourceEmptyState
        emptyMessage="Nothing here"
        emptyDescription="Try again later."
      />,
    );
    expect(screen.getByRole("heading", { name: "Nothing here" })).toBeInTheDocument();
    expect(screen.getByText("Try again later.")).toBeInTheDocument();
  });
});
