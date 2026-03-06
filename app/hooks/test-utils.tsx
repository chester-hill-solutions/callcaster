import React, { ReactElement } from 'react';
import { renderHook, act, RenderHookResult } from '@testing-library/react';
import { vi } from 'vitest';

export interface TestHookOptions<TProps, TResult> {
  initialProps?: TProps;
  wrapper?: React.ComponentType<{ children: React.ReactNode }>;
}

export function renderTestHook<TProps, TResult>(
  hook: (props: TProps) => TResult,
  options: TestHookOptions<TProps, TResult> = {}
): RenderHookResult<TResult, TProps> {
  return renderHook(hook, options);
}

// Utility for testing async hooks
export async function renderAsyncHook<TProps, TResult>(
  hook: (props: TProps) => TResult,
  options: TestHookOptions<TProps, TResult> = {}
): Promise<RenderHookResult<TResult, TProps>> {
  const result = renderHook(hook, options);
  
  // Wait for any initial async operations
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  
  return result;
}

// Mock utilities for common dependencies
export const createMockSupabase = () => ({
  channel: vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnValue({}),
    unsubscribe: vi.fn(),
  }),
  removeChannel: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(),
    update: vi.fn().mockReturnThis(),
  }),
});

export const createMockTwilioDevice = () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  disconnectAll: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  on: vi.fn(),
  removeAllListeners: vi.fn(),
  state: 'disconnected',
  parameters: {},
});

export const createMockCall = () => ({
  accept: vi.fn(),
  disconnect: vi.fn(),
  on: vi.fn(),
  parameters: {},
});

// Test data factories
export const createMockContact = (overrides = {}) => ({
  id: 1,
  first_name: 'John',
  last_name: 'Doe',
  phone_number: '+1234567890',
  email: 'john@example.com',
  workspace: 'test-workspace',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
  ...overrides,
});

export const createMockCampaign = (overrides = {}) => ({
  id: 1,
  name: 'Test Campaign',
  status: 'active',
  workspace: 'test-workspace',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
  ...overrides,
});

export const createMockMessage = (overrides = {}) => ({
  id: 1,
  sid: 'msg_123',
  from: '+1234567890',
  to: '+0987654321',
  body: 'Test message',
  direction: 'outbound',
  status: 'delivered',
  workspace: 'test-workspace',
  date_created: '2023-01-01T00:00:00Z',
  ...overrides,
});

// Async test utilities
export const waitFor = (condition: () => boolean, timeout = 1000): Promise<void> => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const check = () => {
      if (condition()) {
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error('Timeout waiting for condition'));
      } else {
        setTimeout(check, 10);
      }
    };
    
    check();
  });
};

export const waitForNextTick = (): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, 0));
};

// Hook testing utilities
export const createHookTestWrapper = (providers: Record<string, unknown>) => {
  return ({ children }: { children: React.ReactNode }) => {
    let element = children as ReactElement;
    
    // Wrap with providers in order
    Object.entries(providers).forEach(([name, value]) => {
      // This is a simplified version - in real usage you'd have actual provider components
      element = React.createElement('div', { 'data-testid': `provider-${name}` }, element);
    });
    
    return element;
  };
};

// Mock event utilities
export const createMockEvent = (type: string, data: Record<string, unknown> = {}) => ({
  type,
  data,
  timestamp: Date.now(),
  id: Math.random().toString(36).substr(2, 9),
});

export const createMockStorageEvent = (key: string, newValue: string | null, oldValue: string | null = null) => ({
  key,
  newValue,
  oldValue,
  url: 'http://localhost',
  storageArea: localStorage,
});

// Performance testing utilities
export const measureHookPerformance = async <TProps, TResult>(
  hook: (props: TProps) => TResult,
  props: TProps,
  iterations = 1000
): Promise<{ averageTime: number; totalTime: number }> => {
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    renderHook(() => hook(props));
    const end = performance.now();
    times.push(end - start);
  }
  
  const totalTime = times.reduce((sum, time) => sum + time, 0);
  const averageTime = totalTime / iterations;
  
  return { averageTime, totalTime };
};

// Memory leak detection utilities
export const detectMemoryLeaks = async <TProps, TResult>(
  hook: (props: TProps) => TResult,
  props: TProps,
  iterations = 100
): Promise<{ memoryBefore: number; memoryAfter: number; leakDetected: boolean }> => {
  const memoryBefore = (performance as typeof performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0;
  
  for (let i = 0; i < iterations; i++) {
    const { unmount } = renderHook(() => hook(props));
    unmount();
  }
  
  // Force garbage collection if available
  (global as typeof global & { gc?: () => void }).gc?.();
  
  const memoryAfter = (performance as typeof performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0;
  const leakDetected = memoryAfter > memoryBefore * 1.5; // 50% threshold
  
  return { memoryBefore, memoryAfter, leakDetected };
}; 