import { describe, expect, it } from 'vitest';
import { runScript } from '../../../src/main/workbench/scripts';
const mac = process.platform === 'darwin';
const win = process.platform === 'win32';
describe.skipIf(!mac && !win)('script execution', () => {
  it('passes shell metacharacters as stdin data without evaluating them', async () => {
    const text = '$(echo injected) `echo injected` "quotes"\n中文\n';
    const output = await runScript(mac ? 'cat' : '[Console]::Out.Write([Console]::In.ReadToEnd())', text, mac, AbortSignal.timeout(10000));
    expect(output).toBe(text);
  });
  it('returns failures instead of continuing with partial output', async () => {
    await expect(runScript(mac ? 'echo failed >&2\nexit 7' : 'Write-Error failed; exit 7', '', mac, AbortSignal.timeout(10000))).rejects.toThrow('scriptExit:7');
  });
  it('does not spawn an already-cancelled script', async () => {
    const c = new AbortController(); c.abort();
    await expect(runScript('exit 0', '', mac, c.signal)).rejects.toThrow();
  });
  it('terminates a long-running process when its timeout expires', async () => {
    await expect(runScript(mac ? 'sleep 30' : 'Start-Sleep -Seconds 30', '', mac, AbortSignal.timeout(300))).rejects.toThrow('timeout');
  });
});
