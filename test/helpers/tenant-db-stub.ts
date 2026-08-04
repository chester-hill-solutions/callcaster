import { vi } from "vitest";

export const tenantDbStubState = {
  messageInsertResult: [] as unknown[],
  messageInsertError: null as Error | null,
  messageInsertCalls: [] as unknown[],
  contactUpdateCalls: [] as unknown[],
};

export const tenantDbMocks = {
  messageInsert: vi.fn(),
  contactUpdate: vi.fn(),
  callInsert: vi.fn(),
  callDelete: vi.fn(),
  callUpdate: vi.fn(),
  workspaceNumberFindFirst: vi.fn(),
};

function applyTenantDbMockImplementations() {
  tenantDbMocks.messageInsert.mockImplementation(async (payload: unknown) => {
    tenantDbStubState.messageInsertCalls.push(payload);
    if (tenantDbStubState.messageInsertError) {
      throw tenantDbStubState.messageInsertError;
    }
    const rows = tenantDbStubState.messageInsertResult.length
      ? tenantDbStubState.messageInsertResult
      : [{ sid: "SM1", ...(payload as object) }];
    return rows;
  });

  tenantDbMocks.contactUpdate.mockImplementation(async (opts: unknown) => {
    tenantDbStubState.contactUpdateCalls.push(opts);
    return [{ ok: 1 }];
  });

  tenantDbMocks.callInsert.mockImplementation(async (payload: unknown) => [payload]);
  tenantDbMocks.callDelete.mockImplementation(async () => undefined);
  tenantDbMocks.callUpdate.mockImplementation(async (opts: unknown) => [opts]);
  tenantDbMocks.workspaceNumberFindFirst.mockImplementation(async () => null);
}

applyTenantDbMockImplementations();

export function configureTenantDbStub(
  config: Partial<{
    messageInsertResult: unknown[];
    messageInsertError: Error | null;
  }> = {},
) {
  tenantDbStubState.messageInsertResult = config.messageInsertResult ?? [];
  tenantDbStubState.messageInsertError = config.messageInsertError ?? null;
  tenantDbStubState.messageInsertCalls = [];
  tenantDbStubState.contactUpdateCalls = [];
  applyTenantDbMockImplementations();
}

export function createTenantDbMock() {
  return {
    message: { insert: tenantDbMocks.messageInsert },
    contact: { update: tenantDbMocks.contactUpdate },
    call: {
      insert: tenantDbMocks.callInsert,
      delete: tenantDbMocks.callDelete,
      update: tenantDbMocks.callUpdate,
      findFirst: vi.fn(async () => null),
    },
    workspace_number: { findFirst: tenantDbMocks.workspaceNumberFindFirst },
  };
}
