import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { killProcessTree } from '../teammate/agents/runner';

/** Script source is a local file; workflow input is data on stdin, never interpolated into shell source. */
export async function runScript(source: string, input: string, mac: boolean, signal: AbortSignal): Promise<string> {
  if (!source.trim()) throw new Error('scriptMissing');
  signal.throwIfAborted();
  const dir = await mkdtemp(join(tmpdir(), 'wheeldesk-script-'));
  const file = join(dir, mac ? 'action.sh' : 'action.ps1');
  try {
    await writeFile(file, mac ? source : '\uFEFF[Console]::InputEncoding = [System.Text.UTF8Encoding]::new(); [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new();\n' + source, { encoding: 'utf8', mode: 0o600 });
    signal.throwIfAborted();
    return await new Promise<string>((resolve, reject) => {
      const command = mac ? '/bin/zsh' : join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      const args = mac ? ['-f', file] : ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file];
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
      const child = spawn(command, args, { cwd: dir, env, shell: false, windowsHide: true, detached: mac, stdio: ['pipe', 'pipe', 'pipe'] });
      const kill = killProcessTree(mac ? 'mac' : 'win');
      let stdout = '', stderr = '', size = 0, reason: Error | null = null;
      const stop = (error: Error) => { reason ??= error; if (child.pid) kill(child.pid); };
      const abort = () => stop(new Error(signal.reason?.name === 'TimeoutError' ? 'timeout' : 'cancelled'));
      signal.addEventListener('abort', abort, { once: true });
      child.on('spawn', () => { if (signal.aborted) abort(); else child.stdin.end(input); });
      child.stdin.on('error', () => undefined);
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      const read = (text: string, err: boolean) => {
        size += Buffer.byteLength(text);
        if (size > 1024 * 1024) { stop(new Error('outputLimit')); return; }
        if (err) stderr += text; else stdout += text;
      };
      child.stdout.on('data', (s: string) => read(s, false));
      child.stderr.on('data', (s: string) => read(s, true));
      child.on('error', error => { signal.removeEventListener('abort', abort); reject(error); });
      child.on('close', code => {
        signal.removeEventListener('abort', abort);
        if (reason) reject(reason);
        else if (code !== 0) reject(new Error(`scriptExit:${code}: ${stderr.slice(0, 1500)}`));
        else resolve(stdout);
      });
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
}
