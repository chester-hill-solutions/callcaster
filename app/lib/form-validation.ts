import React from 'react';
import type { AppError } from './types';
import { createAppError, safeString, safeNumber, safeBoolean, safeDate } from './type-utils';

// Type-safe validation rules
export interface ValidationRule<T = unknown> {
  validate: (value: T) => boolean;
  message: string;
  code?: string;
}

// Type-safe validation result
export interface ValidationResult {
  isValid: boolean;
  errors: AppError[];
}

// Type-safe form field validation
export interface FormFieldValidation<T = unknown> {
  value: T;
  rules: ValidationRule<T>[];
  required?: boolean;
  fieldName: string;
}

// Type-safe form validation
export interface FormValidation {
  fields: Record<string, FormFieldValidation>;
  customValidations?: (values: Record<string, unknown>) => AppError[];
}

// Common validation rules
export const ValidationRules = {
  // String validations
  required: (fieldName: string): ValidationRule<string> => ({
    validate: (value: string) => value.trim().length > 0,
    message: `${fieldName} is required`,
    code: 'REQUIRED',
  }),

  minLength: (min: number, fieldName: string): ValidationRule<string> => ({
    validate: (value: string) => value.length >= min,
    message: `${fieldName} must be at least ${min} characters long`,
    code: 'MIN_LENGTH',
  }),

  maxLength: (max: number, fieldName: string): ValidationRule<string> => ({
    validate: (value: string) => value.length <= max,
    message: `${fieldName} must be no more than ${max} characters long`,
    code: 'MAX_LENGTH',
  }),

  email: (fieldName: string): ValidationRule<string> => ({
    validate: (value: string) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value);
    },
    message: `${fieldName} must be a valid email address`,
    code: 'INVALID_EMAIL',
  }),

  phone: (fieldName: string): ValidationRule<string> => ({
    validate: (value: string) => {
      const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
      return phoneRegex.test(value.replace(/[\s\-\(\)]/g, ''));
    },
    message: `${fieldName} must be a valid phone number`,
    code: 'INVALID_PHONE',
  }),

  url: (fieldName: string): ValidationRule<string> => ({
    validate: (value: string) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
    message: `${fieldName} must be a valid URL`,
    code: 'INVALID_URL',
  }),

  // Number validations
  min: (min: number, fieldName: string): ValidationRule<number> => ({
    validate: (value: number) => value >= min,
    message: `${fieldName} must be at least ${min}`,
    code: 'MIN_VALUE',
  }),

  max: (max: number, fieldName: string): ValidationRule<number> => ({
    validate: (value: number) => value <= max,
    message: `${fieldName} must be no more than ${max}`,
    code: 'MAX_VALUE',
  }),

  positive: (fieldName: string): ValidationRule<number> => ({
    validate: (value: number) => value > 0,
    message: `${fieldName} must be positive`,
    code: 'POSITIVE_REQUIRED',
  }),

  // Date validations
  futureDate: (fieldName: string): ValidationRule<Date> => ({
    validate: (value: Date) => value > new Date(),
    message: `${fieldName} must be a future date`,
    code: 'FUTURE_DATE_REQUIRED',
  }),

  pastDate: (fieldName: string): ValidationRule<Date> => ({
    validate: (value: Date) => value < new Date(),
    message: `${fieldName} must be a past date`,
    code: 'PAST_DATE_REQUIRED',
  }),

  // Custom validation
  custom: <T>(
    validator: (value: T) => boolean,
    message: string,
    code?: string
  ): ValidationRule<T> => ({
    validate: validator,
    message,
    code,
  }),
};

// Type-safe form validator class
export class FormValidator {
  private validation: FormValidation;

  constructor(validation: FormValidation) {
    this.validation = validation;
  }

  // Validate a single field
  validateField(fieldName: string, value: unknown): ValidationResult {
    const field = this.validation.fields[fieldName];
    if (!field) {
      return {
        isValid: true,
        errors: [],
      };
    }

    const errors: AppError[] = [];

    // Check if required
    if (field.required && (value == null || value === '')) {
      errors.push(
        createAppError(
          ValidationRules.required(field.fieldName).message,
          'REQUIRED',
          { fieldName }
        )
      );
      return { isValid: false, errors };
    }

    // Skip validation if value is null/undefined and not required
    if (value == null || value === '') {
      return { isValid: true, errors: [] };
    }

    // Apply validation rules
    for (const rule of field.rules) {
      if (!rule.validate(value as typeof field.value)) {
        errors.push(
          createAppError(rule.message, rule.code, { fieldName })
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Validate entire form
  validateForm(values: Record<string, unknown>): ValidationResult {
    const allErrors: AppError[] = [];

    // Validate each field
    for (const [fieldName, field] of Object.entries(this.validation.fields)) {
      const value = values[fieldName];
      const result = this.validateField(fieldName, value);
      allErrors.push(...result.errors);
    }

    // Run custom validations
    if (this.validation.customValidations) {
      const customErrors = this.validation.customValidations(values);
      allErrors.push(...customErrors);
    }

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
    };
  }

  // Get field errors
  getFieldErrors(fieldName: string, values: Record<string, unknown>): AppError[] {
    const result = this.validateField(fieldName, values[fieldName]);
    return result.errors;
  }

  // Check if form is valid
  isFormValid(values: Record<string, unknown>): boolean {
    const result = this.validateForm(values);
    return result.isValid;
  }
}

// Type-safe form value sanitizers
export const FormSanitizers = {
  string: (value: unknown): string => safeString(value),
  number: (value: unknown): number => safeNumber(value),
  boolean: (value: unknown): boolean => safeBoolean(value),
  date: (value: unknown): Date | null => safeDate(value),
  email: (value: unknown): string => safeString(value).toLowerCase().trim(),
  phone: (value: unknown): string => safeString(value).replace(/[\s\-\(\)]/g, ''),
  url: (value: unknown): string => safeString(value).trim(),
};

// Type-safe form builder
export class FormBuilder {
  private fields: Record<string, FormFieldValidation> = {};
  private customValidations: ((values: Record<string, unknown>) => AppError[])[] = [];

  // Add a string field
  addStringField(
    fieldName: string,
    rules: ValidationRule<string>[] = [],
    required = false
  ): this {
    this.fields[fieldName] = {
      value: '',
      rules,
      required,
      fieldName,
    };
    return this;
  }

  // Add a number field
  addNumberField(
    fieldName: string,
    rules: ValidationRule<number>[] = [],
    required = false
  ): this {
    this.fields[fieldName] = {
      value: 0,
      rules,
      required,
      fieldName,
    };
    return this;
  }

  // Add a boolean field
  addBooleanField(
    fieldName: string,
    rules: ValidationRule<boolean>[] = [],
    required = false
  ): this {
    this.fields[fieldName] = {
      value: false,
      rules,
      required,
      fieldName,
    };
    return this;
  }

  // Add a date field
  addDateField(
    fieldName: string,
    rules: ValidationRule<Date>[] = [],
    required = false
  ): this {
    this.fields[fieldName] = {
      value: new Date(),
      rules,
      required,
      fieldName,
    };
    return this;
  }

  // Add custom validation
  addCustomValidation(
    validator: (values: Record<string, unknown>) => AppError[]
  ): this {
    this.customValidations.push(validator);
    return this;
  }

  // Build the form validator
  build(): FormValidator {
    return new FormValidator({
      fields: this.fields,
      customValidations: (values) => {
        const errors: AppError[] = [];
        for (const validator of this.customValidations) {
          errors.push(...validator(values));
        }
        return errors;
      },
    });
  }
}

// Utility function to create a form builder
export function createFormBuilder(): FormBuilder {
  return new FormBuilder();
}

// Type-safe form validation hook for React
export function useFormValidation<T extends Record<string, unknown>>(
  validator: FormValidator,
  initialValues: T
) {
  const [values, setValues] = React.useState<T>(initialValues);
  const [errors, setErrors] = React.useState<Record<string, AppError[]>>({});
  const [isValid, setIsValid] = React.useState(() => validator.isFormValid(initialValues));

  const updateField = React.useCallback((fieldName: keyof T, value: unknown) => {
    const newValues = { ...values, [fieldName]: value };
    setValues(newValues);

    const fieldErrors = validator.getFieldErrors(fieldName as string, newValues);
    setErrors(prev => ({ ...prev, [fieldName]: fieldErrors }));

    const formValid = validator.isFormValid(newValues);
    setIsValid(formValid);
  }, [values, validator]);

  const validateField = React.useCallback((fieldName: keyof T) => {
    const fieldErrors = validator.getFieldErrors(fieldName as string, values);
    setErrors(prev => ({ ...prev, [fieldName]: fieldErrors }));
    return fieldErrors.length === 0;
  }, [values, validator]);

  const validateForm = React.useCallback(() => {
    const result = validator.validateForm(values);
    setErrors(
      Object.keys(validator['validation'].fields).reduce((acc, fieldName) => {
        acc[fieldName] = validator.getFieldErrors(fieldName, values);
        return acc;
      }, {} as Record<string, AppError[]>)
    );
    setIsValid(result.isValid);
    return result;
  }, [values, validator]);

  const reset = React.useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setIsValid(validator.isFormValid(initialValues));
  }, [initialValues, validator]);

  return {
    values,
    errors,
    isValid,
    updateField,
    validateField,
    validateForm,
    reset,
  };
} 