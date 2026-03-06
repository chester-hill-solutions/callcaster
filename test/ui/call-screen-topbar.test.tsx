import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { TopBar } from "@/components/CallScreen.TopBar";

describe("TopBar", () => {
  test("shows Load when idle and wires handlers", () => {
    const handleQueueButton = vi.fn();
    const handleNextNumber = vi.fn();
    const handleDialNext = vi.fn();
    const handlePowerDial = vi.fn();

    render(
      <TopBar
        handleQueueButton={handleQueueButton}
        state="idle"
        handleNextNumber={handleNextNumber}
        handleDialNext={handleDialNext}
        handlePowerDial={handlePowerDial}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    expect(handleQueueButton).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Predictive Dial" }));
    expect(handlePowerDial).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Dial Next" }));
    expect(handleDialNext).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Skip Household" }));
    expect(handleNextNumber).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Skip Person" }));
    expect(handleNextNumber).toHaveBeenCalledWith(false);
  });

  test("shows Loading when not idle", () => {
    render(
      <TopBar
        handleQueueButton={() => {}}
        state="loading"
        handleNextNumber={() => {}}
        handleDialNext={() => {}}
        handlePowerDial={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: "Loading" })).toBeInTheDocument();
  });
});

