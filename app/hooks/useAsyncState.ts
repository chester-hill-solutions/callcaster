import { useState, useCallback, useRef } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  isSuccess: boolean;
  isError: boolean;
  isIdle: boolean;
}

export interface UseAsyncStateOptions<T> {
  initialData?: T | null;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  onSettled?: (data: T | null, error: Error | null) => void;
}

export function useAsyncState<T>(
  options: UseAsyncStateOptions<T> = {}
): [
  AsyncState<T>,
  {
    execute: (asyncFn: () => Promise<T>) => Promise<T>;
    setData: (data: T) => void;
    setError: (error: Error) => void;
    reset: () => void;
    isLoading: boolean;
  }
] {
  const { initialData = null, onSuccess, onError, onSettled } = options;
  const mountedRef = useRef(true);

  const [state, setState] = useState<AsyncState<T>>({
    data: initialData,
    loading: false,
    error: null,
    isSuccess: false,
    isError: false,
    isIdle: true,
  });

  const execute = useCallback(
    async (asyncFn: () => Promise<T>): Promise<T> => {
      if (!mountedRef.current) {
        throw new Error('Component unmounted');
      }

      setState(prev => ({
        ...prev,
        loading: true,
        error: null,
        isSuccess: false,
        isError: false,
        isIdle: false,
      }));

      try {
        const data = await asyncFn();
        if (!mountedRef.current) {
          throw new Error('Component unmounted');
        }
        setState(prev => ({
          ...prev,
          data,
          loading: false,
          isSuccess: true,
          isError: false,
          isIdle: false,
        }));
        onSuccess?.(data);
        onSettled?.(data, null);
        return data;
      } catch (error) {
        if (!mountedRef.current) {
          throw error;
        }
        const err = error instanceof Error ? error : new Error(String(error));
        setState(prev => ({
          ...prev,
          loading: false,
          error: err,
          isSuccess: false,
          isError: true,
          isIdle: false,
        }));
        onError?.(err);
        onSettled?.(null, err);
        throw err;
      }
    },
    [onSuccess, onError, onSettled]
  );

  const setData = useCallback((data: T) => {
    setState(prev => ({
      ...prev,
      data,
      error: null,
      isSuccess: true,
      isError: false,
      isIdle: false,
    }));
  }, []);

  const setError = useCallback((error: Error) => {
    setState(prev => ({
      ...prev,
      error,
      loading: false,
      isSuccess: false,
      isError: true,
      isIdle: false,
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      data: initialData,
      loading: false,
      error: null,
      isSuccess: false,
      isError: false,
      isIdle: true,
    });
  }, [initialData]);

  return [
    state,
    { execute, setData, setError, reset, isLoading: state.loading },
  ];
}

// Hook for managing multiple async states
export function useAsyncStates<T extends Record<string, unknown>>(
  initialState: Partial<Record<keyof T, unknown>> = {}
): {
  states: Record<keyof T, AsyncState<unknown>>;
  execute: <K extends keyof T>(key: K, asyncFn: () => Promise<T[K]>) => Promise<T[K]>;
  setData: <K extends keyof T>(key: K, data: T[K]) => void;
  setError: <K extends keyof T>(key: K, error: Error) => void;
  reset: <K extends keyof T>(key: K) => void;
  resetAll: () => void;
} {
  const [states, setStates] = useState<Record<keyof T, AsyncState<unknown>>>(() => {
    const init: Partial<Record<keyof T, AsyncState<unknown>>> = {};
    (Object.keys(initialState) as Array<keyof T>).forEach((key) => {
      init[key] = {
        data: (initialState[key] as T[keyof T]) ?? null,
        loading: false,
        error: null,
        isSuccess: false,
        isError: false,
        isIdle: true,
      };
    });
    return init as Record<keyof T, AsyncState<unknown>>;
  });

  const execute = useCallback(
    async <K extends keyof T>(key: K, asyncFn: () => Promise<T[K]>): Promise<T[K]> => {
      setStates(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          loading: true,
          error: null,
          isSuccess: false,
          isError: false,
          isIdle: false,
        },
      }));

      try {
        const data = await asyncFn();
        setStates(prev => ({
          ...prev,
          [key]: {
            ...prev[key],
            data,
            loading: false,
            isSuccess: true,
            isError: false,
            isIdle: false,
          },
        }));
        return data;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        setStates(prev => ({
          ...prev,
          [key]: {
            ...prev[key],
            loading: false,
            error: err,
            isSuccess: false,
            isError: true,
            isIdle: false,
          },
        }));
        throw err;
      }
    },
    []
  );

  const setData = useCallback(<K extends keyof T>(key: K, data: T[K]) => {
    setStates(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        data,
        error: null,
        isSuccess: true,
        isError: false,
        isIdle: false,
      },
    }));
  }, []);

  const setError = useCallback(<K extends keyof T>(key: K, error: Error) => {
    setStates(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        error,
        loading: false,
        isSuccess: false,
        isError: true,
        isIdle: false,
      },
    }));
  }, []);

  const reset = useCallback(<K extends keyof T>(key: K) => {
    setStates(prev => ({
      ...prev,
      [key]: {
        data: (initialState[key] as T[K]) ?? null,
        loading: false,
        error: null,
        isSuccess: false,
        isError: false,
        isIdle: true,
      },
    }));
  }, [initialState]);

  const resetAll = useCallback(() => {
    setStates(() => {
      const init: Partial<Record<keyof T, AsyncState<unknown>>> = {};
      (Object.keys(initialState) as Array<keyof T>).forEach((key) => {
        init[key] = {
          data: (initialState[key] as T[keyof T]) ?? null,
          loading: false,
          error: null,
          isSuccess: false,
          isError: false,
          isIdle: true,
        };
      });
      return init as Record<keyof T, AsyncState<unknown>>;
    });
  }, [initialState]);

  return {
    states,
    execute,
    setData,
    setError,
    reset,
    resetAll,
  };
} 