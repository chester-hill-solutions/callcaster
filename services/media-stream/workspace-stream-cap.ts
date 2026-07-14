export const DEFAULT_MEDIA_STREAM_MAX_PER_WORKSPACE = 10;

/**
 * Parses MEDIA_STREAM_MAX_PER_WORKSPACE (positive integer). Defaults to 10.
 */
export function parseMediaStreamMaxPerWorkspace(
  raw: string | undefined = process.env.MEDIA_STREAM_MAX_PER_WORKSPACE,
): number {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_MEDIA_STREAM_MAX_PER_WORKSPACE;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(
      `MEDIA_STREAM_MAX_PER_WORKSPACE must be a positive integer, got: ${raw}`,
    );
  }

  return parsed;
}

/**
 * Tracks concurrent media-stream WebSocket connections per workspace.
 */
export class WorkspaceStreamCapTracker {
  private readonly maxPerWorkspace: number;
  private readonly counts = new Map<string, number>();

  constructor(maxPerWorkspace: number) {
    if (maxPerWorkspace < 1) {
      throw new Error("maxPerWorkspace must be at least 1");
    }
    this.maxPerWorkspace = maxPerWorkspace;
  }

  getMaxPerWorkspace(): number {
    return this.maxPerWorkspace;
  }

  getCount(workspaceId: string): number {
    return this.counts.get(workspaceId) ?? 0;
  }

  tryAcquire(workspaceId: string): boolean {
    const current = this.getCount(workspaceId);
    if (current >= this.maxPerWorkspace) {
      return false;
    }
    this.counts.set(workspaceId, current + 1);
    return true;
  }

  release(workspaceId: string): void {
    const current = this.getCount(workspaceId);
    if (current <= 0) {
      return;
    }
    if (current === 1) {
      this.counts.delete(workspaceId);
    } else {
      this.counts.set(workspaceId, current - 1);
    }
  }

  totalActive(): number {
    let total = 0;
    for (const count of this.counts.values()) {
      total += count;
    }
    return total;
  }

  activeWorkspaceCount(): number {
    return this.counts.size;
  }
}
