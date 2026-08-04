import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from "@/lib/logger.client";

export interface UseLocalStorageOptions<T> {
  defaultValue?: T;
  serializer?: (value: T) => string;
  deserializer?: (value: string) => T;
  onError?: (error: Error) => void;
}

export function useLocalStorage<T>(
  key: string,
  options: UseLocalStorageOptions<T> = {}
): [T | null, (value: T | null) => void, () => void] {
  const {
    defaultValue = null,
    serializer = JSON.stringify,
    deserializer = JSON.parse,
    onError,
  } = options;

  const [storedValue, setStoredValue] = useState<T | null>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item === null) {
        return defaultValue;
      }
      return deserializer(item);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Error reading localStorage key "${key}":`, err);
      onError?.(err);
      return defaultValue;
    }
  });

  const setValue = useCallback(
    (value: T | null) => {
      try {
        if (value === null) {
          window.localStorage.removeItem(key);
        } else {
          window.localStorage.setItem(key, serializer(value));
        }
        setStoredValue(value);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(`Error setting localStorage key "${key}":`, err);
        onError?.(err);
      }
    },
    [key, serializer, onError]
  );

  const removeValue = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
      setStoredValue(null);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Error removing localStorage key "${key}":`, err);
      onError?.(err);
    }
  }, [key, onError]);

  /**
   * @effect Keep state in sync with this localStorage key when it changes in another tab/window.
   * @effect-deps key, deserializer, onError (re-subscribes and re-parses using the current key/deserializer)
   * @effect-side-effects subscription (window 'storage' event listener; removed on cleanup)
   * @effect-why-not-loader Cross-tab localStorage sync is client-only browser state, not server/route data.
   */
  // Listen for changes to this localStorage key from other tabs/windows
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setStoredValue(deserializer(e.newValue));
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          logger.error(`Error parsing localStorage value for key "${key}":`, err);
          onError?.(err);
        }
      } else if (e.key === key && e.newValue === null) {
        setStoredValue(null);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key, deserializer, onError]);

  return [storedValue, setValue, removeValue];
}

// Hook for managing multiple localStorage values
export function useLocalStorageMulti<T extends Record<string, any>>(
  keys: (keyof T)[],
  options: UseLocalStorageOptions<any> = {}
): {
  values: Partial<T>;
  setValue: <K extends keyof T>(key: K, value: T[K]) => void;
  setValues: (values: Partial<T>) => void;
  removeValue: (key: keyof T) => void;
  removeAll: () => void;
  clearErrors: () => void;
} {
  const [values, setValues] = useState<Partial<T>>({});
  const [errors, setErrors] = useState<Record<string, Error>>({});

  const setValue = useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      try {
        const serializedValue = options.serializer ? options.serializer(value) : JSON.stringify(value);
        window.localStorage.setItem(String(key), serializedValue);
        setValues(prev => ({ ...prev, [key]: value }));
        
        // Clear error for this key
        if (errors[String(key)]) {
          setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[String(key)];
            return newErrors;
          });
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(`Error setting localStorage key "${String(key)}":`, err);
        setErrors(prev => ({ ...prev, [String(key)]: err }));
        options.onError?.(err);
      }
    },
    [options, errors]
  );

  const setValuesAction = useCallback(
    (newValues: Partial<T>) => {
      Object.entries(newValues).forEach(([key, value]) => {
        setValue(key as keyof T, value);
      });
    },
    [setValue]
  );

  const removeValue = useCallback(
    (key: keyof T) => {
      try {
        window.localStorage.removeItem(String(key));
        setValues(prev => {
          const newValues = { ...prev };
          delete newValues[key];
          return newValues;
        });
        
        // Clear error for this key
        if (errors[String(key)]) {
          setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[String(key)];
            return newErrors;
          });
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(`Error removing localStorage key "${String(key)}":`, err);
        setErrors(prev => ({ ...prev, [String(key)]: err }));
        options.onError?.(err);
      }
    },
    [options, errors]
  );

  const removeAll = useCallback(() => {
    keys.forEach(key => {
      removeValue(key);
    });
  }, [keys, removeValue]);

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  /**
   * @effect CANDIDATE-REMOVE Populate `values` by reading each key from localStorage on mount.
   * @effect-deps keys, options (re-reads if the tracked key list or serializer options change)
   * @effect-side-effects none — synchronous localStorage.getItem reads only; setValues at the end
   * @effect-why-not-loader This is derived initial state, not data fetching: the single-key
   *   useLocalStorage above already does this via a lazy useState(() => ...) initializer with no
   *   effect. useLocalStorageMulti could do the same (compute initialValues in a lazy initializer)
   *   instead of reading on mount via useEffect, avoiding an extra render with empty `values`.
   */
  // Initialize values from localStorage
  useEffect(() => {
    const initialValues: Partial<T> = {};
    
    keys.forEach(key => {
      try {
        const item = window.localStorage.getItem(String(key));
        if (item !== null) {
          const value = options.deserializer ? options.deserializer(item) : JSON.parse(item);
          initialValues[key] = value;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(`Error reading localStorage key "${String(key)}":`, err);
        setErrors(prev => ({ ...prev, [String(key)]: err }));
        options.onError?.(err);
      }
    });

    setValues(initialValues);
  }, [keys, options]);

  return {
    values,
    setValue,
    setValues: setValuesAction,
    removeValue,
    removeAll,
    clearErrors,
  };
}

// Hook for session storage (similar to localStorage but session-scoped)
export function useSessionStorage<T>(
  key: string,
  options: UseLocalStorageOptions<T> = {}
): [T | null, (value: T | null) => void, () => void] {
  const {
    defaultValue = null,
    serializer = JSON.stringify,
    deserializer = JSON.parse,
    onError,
  } = options;

  const [storedValue, setStoredValue] = useState<T | null>(() => {
    try {
      const item = window.sessionStorage.getItem(key);
      if (item === null) {
        return defaultValue;
      }
      return deserializer(item);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Error reading sessionStorage key "${key}":`, err);
      onError?.(err);
      return defaultValue;
    }
  });

  const setValue = useCallback(
    (value: T | null) => {
      try {
        if (value === null) {
          window.sessionStorage.removeItem(key);
        } else {
          window.sessionStorage.setItem(key, serializer(value));
        }
        setStoredValue(value);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(`Error setting sessionStorage key "${key}":`, err);
        onError?.(err);
      }
    },
    [key, serializer, onError]
  );

  const removeValue = useCallback(() => {
    try {
      window.sessionStorage.removeItem(key);
      setStoredValue(null);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Error removing sessionStorage key "${key}":`, err);
      onError?.(err);
    }
  }, [key, onError]);

  return [storedValue, setValue, removeValue];
} 