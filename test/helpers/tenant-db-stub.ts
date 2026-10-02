import { vi } from "vitest";

export const tenantDbStubState = {
  messageInsertResult: [] as unknown[],
  messageInsertError: null as Error | null,
  messageInsertCalls: [] as unknown[],
  messageUpdateCalls: [] as unknown[],
  messageDeleteCalls: [] as unknown[],
  contactUpdateCalls: [] as unknown[],
};

export const tenantDbMocks = {
  messageInsert: vi.fn(),
  messageUpdate: vi.fn(),
  messageDelete: vi.fn(),
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

  tenantDbMocks.messageUpdate.mockImplementation(async (opts: { set?: Record<string, unknown> }) => {
    tenantDbStubState.messageUpdateCalls.push(opts);
    // The intent-row resolve (#1584) returns the row a send ends with; honor a
    // configured insert result so route tests keep their exact payload shape.
    if (tenantDbStubState.messageInsertResult.length) {
      return tenantDbStubState.messageInsertResult;
    }
    const last = tenantDbStubState.messageInsertCalls.at(-1) as Record<string, unknown> | undefined;
    return [{ ...(last ?? {}), ...(opts.set ?? {}) }];
  });
  tenantDbMocks.messageDelete.mockImplementation(async (opts: unknown) => {
    tenantDbStubState.messageDeleteCalls.push(opts);
  });

  tenantDbMocks.contactUpdate.mockImplementation(async (opts: unknown) => {
    tenantDbStubState.contactUpdateCalls.push(opts);
    return [{ ok: 1 }];
  });

  tenantDbMocks.callInsert.mockImplementation(async (payload: unknown) => [payload]);
  tenantDbMocks.callDelete.mockImplementation(async () => undefined);
  tenantDbMocks.callUpdate.mockImplementation(async (opts: unknown) => [opts]);
  // Default: the workspace owns the number and it is not suspended, so send
  // paths reach their subject instead of stopping at the ownership gate. Tests
  // that are about ownership override this with a `null` (not owned) or a
  // `suspended_at` row. Proven against a real database in
  // test/integration-db/caller-id-usability.test.ts.
  tenantDbMocks.workspaceNumberFindFirst.mockImplementation(async () => ({
    id: 1,
    suspended_at: null,
  }));
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
  tenantDbStubState.messageUpdateCalls = [];
  tenantDbStubState.messageDeleteCalls = [];
  tenantDbStubState.contactUpdateCalls = [];
  applyTenantDbMockImplementations();
}

export function createTenantDbMock() {
  return {
    message: {
      insert: tenantDbMocks.messageInsert,
      update: tenantDbMocks.messageUpdate,
      delete: tenantDbMocks.messageDelete,
    },
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
