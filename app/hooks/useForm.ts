import { useState, useCallback, useRef } from 'react';
import { logger } from "@/lib/logger.client";

export interface ValidationRule<T> {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: T[keyof T]) => string | null;
}

export interface FormConfig<T> {
  initialValues: T;
  validationRules?: Partial<Record<keyof T, ValidationRule<T>>>;
  onSubmit?: (values: T) => void | Promise<void>;
  onError?: (errors: Record<keyof T, string>) => void;
}

function validateFieldValue<T extends Record<string, unknown>>(
  field: keyof T,
  values: T,
  validationRules: Partial<Record<keyof T, ValidationRule<T>>>
): string | null {
  const value = values[field];
  const rules = validationRules[field] as ValidationRule<T> | undefined;

  if (!rules) return null;

  if (rules.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
    return `${String(field)} is required`;
  }

  if (!value && !rules.required) return null;

  if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
    return `${String(field)} must be at least ${rules.minLength} characters`;
  }

  if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
    return `${String(field)} must be no more than ${rules.maxLength} characters`;
  }

  if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
    return `${String(field)} format is invalid`;
  }

  if (rules.custom) {
    return rules.custom(value);
  }

  return null;
}

export interface FormState<T> {
  values: T;
  errors: Record<keyof T, string>;
  touched: Record<keyof T, boolean>;
  isSubmitting: boolean;
  isValid: boolean;
  isDirty: boolean;
}

export interface FormActions<T> {
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  setValues: (values: Partial<T>) => void;
  setError: <K extends keyof T>(field: K, error: string) => void;
  setErrors: (errors: Partial<Record<keyof T, string>>) => void;
  setTouched: <K extends keyof T>(field: K, touched: boolean) => void;
  setTouchedAll: (touched: boolean) => void;
  reset: () => void;
  submit: () => Promise<void>;
  validate: () => Record<keyof T, string>;
  validateField: <K extends keyof T>(field: K) => string | null;
}

export function useForm<T extends Record<string, unknown>>(
  config: FormConfig<T>
): [FormState<T>, FormActions<T>] {
  const { initialValues, onSubmit, onError } = config;
  const validationRules: Partial<Record<keyof T, ValidationRule<T>>> =
    config.validationRules ?? {};
  const isSubmittingRef = useRef(false);

  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Record<keyof T, string>>({} as Record<keyof T, string>);
  const [touched, setTouchedState] = useState<Record<keyof T, boolean>>({} as Record<keyof T, boolean>);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const valuesRef = useRef(values);
  const touchedRef = useRef(touched);
  valuesRef.current = values;
  touchedRef.current = touched;

  // Calculate derived state
  const isValid = Object.keys(errors).length === 0 || Object.values(errors).every(error => !error);
  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);

  // Validation function
  const validateField = useCallback(
    <K extends keyof T>(field: K): string | null =>
      validateFieldValue(field, values, validationRules),
    [values, validationRules]
  );

  // Validate all fields
  const validate = useCallback((): Record<keyof T, string> => {
    const newErrors: Record<keyof T, string> = {} as Record<keyof T, string>;
    
    for (const field in validationRules) {
      const error = validateField(field as keyof T);
      if (error) {
        newErrors[field as keyof T] = error;
      }
    }

    setErrors(newErrors);
    return newErrors;
  }, [validateField, validationRules]);

  // Set single value
  const setValue = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => {
      const next = { ...valuesRef.current, [field]: value };
      valuesRef.current = next;
      setValues(next);
      setErrors(prevErrors => {
        if (touchedRef.current[field]) {
          const msg = validateFieldValue(field, next, validationRules) || '';
          if (msg === (prevErrors[field] || '')) return prevErrors;
          return { ...prevErrors, [field]: msg };
        }
        if (prevErrors[field]) {
          return { ...prevErrors, [field]: '' };
        }
        return prevErrors;
      });
    },
    [validationRules]
  );

  // Set multiple values
  const setValuesAction = useCallback(
    (newValues: Partial<T>) => {
      const next = { ...valuesRef.current, ...newValues };
      valuesRef.current = next;
      setValues(next);
      setErrors(prevErrors => {
        let nextErrors = { ...prevErrors };
        let changed = false;
        for (const field of Object.keys(touchedRef.current) as Array<keyof T>) {
          if (!touchedRef.current[field]) continue;
          const msg = validateFieldValue(field, next, validationRules) || '';
          if (nextErrors[field] !== msg) {
            nextErrors = { ...nextErrors, [field]: msg };
            changed = true;
          }
        }
        return changed ? nextErrors : prevErrors;
      });
    },
    [validationRules]
  );

  // Set single error
  const setError = useCallback(
    <K extends keyof T>(field: K, error: string) => {
      setErrors(prev => ({ ...prev, [field]: error }));
    },
    []
  );

  // Set multiple errors
  const setErrorsAction = useCallback((newErrors: Partial<Record<keyof T, string>>) => {
    setErrors(prev => ({ ...prev, ...newErrors }));
  }, []);

  // Set touched state for single field
  const setTouched = useCallback(
    <K extends keyof T>(field: K, touchedValue: boolean) => {
      setTouchedState(prev => ({ ...prev, [field]: touchedValue }));
      if (touchedValue) {
        setErrors(prevErrors => {
          const msg =
            validateFieldValue(field, valuesRef.current, validationRules) || '';
          if (msg === (prevErrors[field] || '')) return prevErrors;
          return { ...prevErrors, [field]: msg };
        });
      }
    },
    [validationRules]
  );

  // Set touched state for all fields
  const setTouchedAll = useCallback(
    (touchedValue: boolean) => {
      const newTouched: Record<keyof T, boolean> = {} as Record<keyof T, boolean>;
      (Object.keys(initialValues) as Array<keyof T>).forEach((field) => {
        newTouched[field] = touchedValue;
      });
      setTouchedState(newTouched);
      if (touchedValue) {
        setErrors((prevErrors) => {
          const next = { ...prevErrors } as Record<keyof T, string>;
          for (const field of Object.keys(newTouched) as Array<keyof T>) {
            if (!newTouched[field]) continue;
            next[field] =
              validateFieldValue(field, valuesRef.current, validationRules) || '';
          }
          return next;
        });
      }
    },
    [initialValues, validationRules]
  );

  // Reset form
  const reset = useCallback(() => {
    setValues(initialValues);
    valuesRef.current = initialValues;
    setErrors({} as Record<keyof T, string>);
    setTouchedState({} as Record<keyof T, boolean>);
    setIsSubmitting(false);
  }, [initialValues]);

  // Submit form
  const submit = useCallback(async () => {
    if (isSubmittingRef.current) return;

    const validationErrors = validate();
    
    if (Object.keys(validationErrors).length > 0) {
      onError?.(validationErrors);
      return;
    }

    if (!onSubmit) return;

    try {
      isSubmittingRef.current = true;
      setIsSubmitting(true);
      await onSubmit(values);
    } catch (error) {
      logger.error('Form submission error:', error);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [values, validate, onSubmit, onError]);

  const state: FormState<T> = {
    values,
    errors,
    touched,
    isSubmitting,
    isValid,
    isDirty,
  };

  const actions: FormActions<T> = {
    setValue,
    setValues: setValuesAction,
    setError,
    setErrors: setErrorsAction,
    setTouched,
    setTouchedAll,
    reset,
    submit,
    validate,
    validateField,
  };

  return [state, actions];
}

// Hook for handling form fields with validation
export function useFormField<T, K extends keyof T>(
  formState: FormState<T>,
  formActions: FormActions<T>,
  field: K
) {
  const value = formState.values[field];
  const error = formState.errors[field];
  const isTouched = formState.touched[field];

  const setValue = useCallback(
    (newValue: T[K]) => {
      formActions.setValue(field, newValue);
    },
    [formActions, field]
  );

  const setTouched = useCallback(
    (touched: boolean) => {
      formActions.setTouched(field, touched);
    },
    [formActions, field]
  );

  const validate = useCallback(() => {
    return formActions.validateField(field);
  }, [formActions, field]);

  return {
    value,
    error,
    isTouched,
    setValue,
    setTouched,
    validate,
    hasError: !!error,
    isValid: !error,
  } as const;
} 