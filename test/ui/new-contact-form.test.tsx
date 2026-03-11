import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

describe("app/components/call-list/records/NewContactForm.tsx", () => {
  test("wires input changes, audience select change, and submit", async () => {
    const { NewContactForm } = await import("@/components/call-list/records/NewContactForm");

    const openContact = vi.fn();
    const handleContact = vi.fn();

    const fetcher = {
      Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
    } as any;

    render(
      <NewContactForm
        fetcher={fetcher}
        openContact={openContact}
        handleContact={handleContact}
        newContact={{
          firstname: "",
          surname: "",
          phone: "",
          email: "",
          audiences: [],
        }}
        audiences={[
          { id: "a1", name: "Audience 1" },
          { id: "a2", name: "Audience 2" },
        ] as any}
      />,
    );

    fireEvent.change(screen.getByLabelText("First Name"), { target: { name: "firstname", value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Last Name"), { target: { name: "surname", value: "Lovelace" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { name: "phone", value: "123" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { name: "email", value: "a@b.com" } });

    expect(handleContact).toHaveBeenCalledWith("firstname", "Ada");
    expect(handleContact).toHaveBeenCalledWith("surname", "Lovelace");
    expect(handleContact).toHaveBeenCalledWith("phone", "123");
    expect(handleContact).toHaveBeenCalledWith("email", "a@b.com");

    const select = screen.getByLabelText("Select Audiences") as HTMLSelectElement;
    fireEvent.change(select, { target: { name: "audiences" } });
    expect(handleContact).toHaveBeenCalledWith("audiences", expect.any(Object));

    const form = screen.getByRole("button", { name: "ADD" }).closest("form") as HTMLFormElement;
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("enctype")).toBe("multipart/form-data");

    fireEvent.submit(form);
    expect(openContact).toHaveBeenCalledTimes(1);
  });
});

