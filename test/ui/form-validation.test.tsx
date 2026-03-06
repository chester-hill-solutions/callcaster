import React from "react";
import { act, render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import {
  createFormBuilder,
  FormSanitizers,
  FormValidator,
  useFormValidation,
  ValidationRules,
} from "@/lib/form-validation";

describe("form-validation", () => {
  test("ValidationRules cover common patterns", () => {
    expect(ValidationRules.required("Name").validate("x")).toBe(true);
    expect(ValidationRules.required("Name").validate(" ")).toBe(false);

    expect(ValidationRules.minLength(3, "X").validate("abc")).toBe(true);
    expect(ValidationRules.minLength(3, "X").validate("ab")).toBe(false);

    expect(ValidationRules.maxLength(3, "X").validate("abc")).toBe(true);
    expect(ValidationRules.maxLength(3, "X").validate("abcd")).toBe(false);

    expect(ValidationRules.email("Email").validate("a@b.com")).toBe(true);
    expect(ValidationRules.email("Email").validate("nope")).toBe(false);

    expect(ValidationRules.phone("Phone").validate("+15551234567")).toBe(true);
    expect(ValidationRules.phone("Phone").validate("(555) 123-4567")).toBe(true);
    expect(ValidationRules.phone("Phone").validate("bad")).toBe(false);

    expect(ValidationRules.url("URL").validate("https://example.com")).toBe(true);
    expect(ValidationRules.url("URL").validate("notaurl")).toBe(false);

    expect(ValidationRules.min(2, "N").validate(2)).toBe(true);
    expect(ValidationRules.min(2, "N").validate(1)).toBe(false);

    expect(ValidationRules.max(2, "N").validate(2)).toBe(true);
    expect(ValidationRules.max(2, "N").validate(3)).toBe(false);

    expect(ValidationRules.positive("N").validate(1)).toBe(true);
    expect(ValidationRules.positive("N").validate(0)).toBe(false);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-01T00:00:00.000Z"));
    expect(ValidationRules.futureDate("D").validate(new Date("2020-01-02T00:00:00.000Z"))).toBe(
      true,
    );
    expect(ValidationRules.pastDate("D").validate(new Date("2019-12-31T00:00:00.000Z"))).toBe(
      true,
    );
    vi.useRealTimers();

    expect(ValidationRules.custom((v: number) => v === 1, "msg").validate(1)).toBe(true);
  });

  test("FormBuilder + FormValidator validateField/validateForm paths", () => {
    const validator = createFormBuilder()
      .addStringField("name", [ValidationRules.minLength(2, "Name")], true)
      .addNumberField("age", [ValidationRules.min(18, "Age")], false)
      .addBooleanField(
        "terms",
        [ValidationRules.custom((v: boolean) => v === true, "terms required", "TERMS")],
        true,
      )
      .addDateField("when", [ValidationRules.pastDate("When")], false)
      .addCustomValidation((values) => {
        return values.name === "bad" ? [{ message: "nope", code: "X" } as any] : [];
      })
      .build();

    // Unknown field is treated as valid.
    expect(validator.validateField("missing", "x")).toEqual({ isValid: true, errors: [] });

    // Required missing returns early with required error.
    const req = validator.validateField("name", "");
    expect(req.isValid).toBe(false);
    expect(req.errors[0].message).toContain("name is required");

    // Optional empty is valid.
    expect(validator.validateField("age", "")).toEqual({ isValid: true, errors: [] });
    expect(validator.validateField("when", "")).toEqual({ isValid: true, errors: [] });

    // Required boolean uses custom rule (false fails).
    const terms = validator.validateField("terms", false);
    expect(terms.isValid).toBe(false);

    // Rule failure.
    const tooYoung = validator.validateField("age", 10);
    expect(tooYoung.isValid).toBe(false);

    // validateForm + custom validations.
    const res = validator.validateForm({ name: "bad", age: 20 });
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.message === "nope")).toBe(true);

    expect(validator.getFieldErrors("age", { age: 10, name: "ok" })).toHaveLength(1);
    expect(validator.isFormValid({ name: "ok", age: 20, terms: true })).toBe(true);
  });

  test("FormSanitizers normalize inputs", () => {
    expect(FormSanitizers.string(1)).toBe("1");
    expect(FormSanitizers.number("3.14")).toBeCloseTo(3.14);
    expect(FormSanitizers.boolean("true")).toBe(true);
    expect(FormSanitizers.date("2020-01-01T00:00:00.000Z")).toBeInstanceOf(Date);
    expect(FormSanitizers.date("nope")).toBeNull();
    expect(FormSanitizers.email("  A@B.COM ")).toBe("a@b.com");
    expect(FormSanitizers.phone("(555) 123-4567")).toBe("5551234567");
    expect(FormSanitizers.url("  https://example.com ")).toBe("https://example.com");
  });

  test("useFormValidation hook updates values/errors/isValid and can reset", () => {
    const validator = new FormValidator({
      fields: {
        name: { value: "", rules: [ValidationRules.minLength(2, "Name")], required: true, fieldName: "Name" },
      },
    } as any);

    let api: any = null;
    function TestComp() {
      api = useFormValidation(validator, { name: "" });
      return null;
    }

    render(<TestComp />);

    expect(api.isValid).toBe(false);
    expect(api.values).toEqual({ name: "" });

    act(() => {
      api.updateField("name", "a");
    });
    expect(api.isValid).toBe(false);

    act(() => {
      expect(api.validateField("name")).toBe(false);
    });

    act(() => {
      api.updateField("name", "ab");
    });
    expect(api.isValid).toBe(true);

    act(() => {
      expect(api.validateField("name")).toBe(true);
    });

    act(() => {
      const r = api.validateForm();
      expect(r.isValid).toBe(true);
    });

    act(() => {
      api.reset();
    });
    expect(api.values).toEqual({ name: "" });
    expect(api.isValid).toBe(false);
  });
});

