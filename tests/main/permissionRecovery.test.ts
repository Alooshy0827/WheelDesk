import { afterEach, describe, expect, it, vi } from 'vitest';
import { PermissionRecovery } from '../../src/main/workbench/permissionRecovery';
import type { HelperStatus } from '../../src/shared/protocol';

describe('permission recovery', () => {
  let recovery: PermissionRecovery | undefined;
  afterEach(() => { recovery?.dispose(); vi.useRealTimers(); });

  it('reconnects after a grant without retrying a persistently denied tap', async () => {
    vi.useFakeTimers();
    let allowed = false;
    const retry = vi.fn();
    recovery = new PermissionRecovery(() => 'noAccess', async () => allowed, retry);
    await vi.advanceTimersByTimeAsync(4000);
    expect(retry).not.toHaveBeenCalled();
    allowed = true;
    await vi.advanceTimersByTimeAsync(10000);
    expect(retry).toHaveBeenCalledTimes(1);
    allowed = false;
    await vi.advanceTimersByTimeAsync(2000);
    allowed = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it('does not probe while running or failed and does not retry after shutdown', async () => {
    let status: HelperStatus = 'running';
    let finish: (value: boolean) => void = () => undefined;
    const check = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    const retry = vi.fn();
    recovery = new PermissionRecovery(() => status, check, retry);
    await recovery.poll();
    status = 'failed';
    await recovery.poll();
    expect(check).not.toHaveBeenCalled();
    status = 'noAccess';
    const pending = recovery.poll();
    await recovery.poll();
    expect(check).toHaveBeenCalledTimes(1);
    recovery.dispose();
    finish(true);
    await pending;
    expect(retry).not.toHaveBeenCalled();
  });

  it('ignores failed probes and a grant returned after the bridge is already running', async () => {
    let status: HelperStatus = 'noAccess';
    const retry = vi.fn();
    const check = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockImplementationOnce(async () => {
      status = 'running'; return true;
    });
    recovery = new PermissionRecovery(() => status, check, retry);
    await recovery.poll();
    await recovery.poll();
    expect(retry).not.toHaveBeenCalled();
  });
});
