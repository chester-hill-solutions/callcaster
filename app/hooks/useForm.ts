import { useState, useCallback, useRef, useEffect } from 'react';

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
  const { initialValues, validationRules = {}, onSubmit, onError } = config;
  const isSubmittingRef = useRef(false);

  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Record<keyof T, string>>({} as Record<keyof T, string>);
  const [touched, setTouched] = useState<Record<keyof T, boolean>>({} as Record<keyof T, boolean>);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate derived state
  const isValid = Object.keys(errors).length === 0 || Object.values(errors).every(error => !error);
  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);

  // Validation function
  const validateField = useCallback(
    <K extends keyof T>(field: K): string | null => {
      const value = values[field];
      const rules = validationRules[field];

      if (!rules) return null;

      // Required validation
      if (rules.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
        return `${String(field)} is required`;
      }

      // Skip other validations if value is empty and not required
      if (!value && !rules.required) return null;

      // Min length validation
      if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
        return `${String(field)} must be at least ${rules.minLength} characters`;
      }

      // Max length validation
      if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
        return `${String(field)} must be no more than ${rules.maxLength} characters`;
      }

      // Pattern validation
      if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
        return `${String(field)} format is invalid`;
      }

      // Custom validation
      if (rules.custom) {
        return rules.custom(value);
      }

      return null;
    },
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
      setValues(prev => ({ ...prev, [field]: value }));
      
      // Clear error when field is modified
      if (errors[field]) {
        setErrors(prev => ({ ...prev, [field]: '' }));
      }
    },
    [errors]
  );

  // Set multiple values
  const setValuesAction = useCallback((newValues: Partial<T>) => {
    setValues(prev => ({ ...prev, ...newValues }));
  }, []);

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
      setTouched(prev => ({ ...prev, [field]: touchedValue }));
    },
    []
  );

  // Set touched state for all fields
  const setTouchedAll = useCallback((touchedValue: boolean) => {
    const newTouched: Record<keyof T, boolean> = {} as Record<keyof T, boolean>;
    (Object.keys(initialValues) as Array<keyof T>).forEach((field) => {
      newTouched[field] = touchedValue;
    });
    setTouched(newTouched);
  }, [initialValues]);

  // Reset form
  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({} as Record<keyof T, string>);
    setTouched({} as Record<keyof T, boolean>);
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
      console.error('Form submission error:', error);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [values, validate, onSubmit, onError]);

  // Auto-validate on blur
  useEffect(() => {
    const touchedFields = (Object.keys(touched) as Array<keyof T>).filter(field => touched[field]);
    if (touchedFields.length > 0) {
      const newErrors = { ...errors } as Record<keyof T, string>;
      let hasChanges = false;

      touchedFields.forEach((field) => {
        const error = validateField(field);
        if (error !== errors[field]) {
          newErrors[field] = error || '';
          hasChanges = true;
        }
      });

      if (hasChanges) {
        setErrors(newErrors);
      }
    }
  }, [values, touched, validateField, errors]);

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