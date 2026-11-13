import { beforeEach, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerDeskScheme, serveDeskScheme } from '../../src/main/workbench/protocol';

const h = vi.hoisted(() => ({ register: vi.fn(), handle: vi.fn(), fetch: vi.fn() }));
vi.mock('electron', () => ({ protocol: { registerSchemesAsPrivileged: h.register, handle: h.handle }, net: { fetch: h.fetch } }));
beforeEach(() => { vi.clearAllMocks(); });
it('registers a secure fetch-capable local origin for the original audio loader', () => {
  registerDeskScheme();
  expect(h.register).toHaveBeenCalledWith([{ scheme: 'wheeldesk', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
});
it('serves bundled assets from inside the renderer root', async () => {
  const root = resolve('out/renderer');
  serveDeskScheme(root);
  const handler = h.handle.mock.calls[0][1] as (r: { url: string; method: string }) => Promise<Response>;
  h.fetch.mockResolvedValue(new Response('audio'));
  await handler({ url: 'wheeldesk://app/sounds/SRP_4.wav', method: 'GET' });
  expect(h.fetch).toHaveBeenCalledWith(pathToFileURL(resolve(root, 'sounds/SRP_4.wav')).toString());
});
it('rejects other hosts, writes, malformed paths and encoded traversal', async () => {
  serveDeskScheme(resolve('out/renderer'));
  const handler = h.handle.mock.calls[0][1] as (r: { url: string; method: string }) => Promise<Response>;
  for (const [url, method] of [
    ['wheeldesk://evil/sounds/SRP_4.wav', 'GET'], ['wheeldesk://app/sounds/SRP_4.wav', 'POST'],
    ['wheeldesk://app/%2e%2e%2fsecret', 'GET'], ['wheeldesk://app/%ZZ', 'GET'],
  ]) expect((await handler({ url, method })).status).toBe(404);
  expect(h.fetch).not.toHaveBeenCalled();
});
