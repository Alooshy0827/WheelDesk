import { execFile } from 'node:child_process';
import type { HelperStatus } from '../../shared/protocol';

/** Probe from the same signed executable/parent as the real event tap. No prompts. */
export function checkInputAccess(command: string): Promise<boolean> {
  return new Promise(resolve => {
    execFile(command, ['--check-access'], { timeout: 1500, maxBuffer: 1024, windowsHide: true }, error => resolve(!error));
  });
}

/** Retry once per observed permission grant; a denied tap cannot cause a restart loop. */
export class PermissionRecovery {
  private disposed = false;
  private busy = false;
  private retried = false;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(private readonly status: () => HelperStatus, private readonly check: () => Promise<boolean>,
    private readonly retry: () => void) {
    this.timer = setInterval(() => void this.poll(), 2000);
    this.timer.unref();
  }

  async poll(): Promise<void> {
    if (this.disposed || this.busy || this.status() !== 'noAccess') return;
    this.busy = true;
    try {
      const granted = await this.check();
      if (this.disposed || this.status() !== 'noAccess') return;
      if (!granted) this.retried = false;
      else if (!this.retried) { this.retried = true; this.retry(); }
    } catch { /* A failed probe is not evidence of a permission grant. */ }
    finally { this.busy = false; }
  }

  dispose(): void { this.disposed = true; clearInterval(this.timer); }
}
