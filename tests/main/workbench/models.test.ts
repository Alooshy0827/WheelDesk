import { describe, expect, it, vi } from 'vitest';
import { clearChangedModelKeys, testModelConnection } from '../../../src/main/workbench/models';
import { applyModelPreset, DESK_PROVIDERS } from '../../../src/shared/workbenchModels';
import { normalizeWorkbench } from '../../../src/shared/actions';
import type { BuiltinProfile } from '../../../src/shared/teammate/settings';

const profile: BuiltinProfile = { id: 'p', name: 'My model', kind: 'builtin', provider: 'custom',
  protocol: 'openai', baseUrl: 'http://localhost:1234/v1', model: 'fixture', tagColor: 3, tagColorCustom: null };
const response = (data: unknown) => new Response(`data: ${JSON.stringify(data)}\n\ndata: [DONE]\n\n`);

describe('model presets and credentials', () => {
  it.each(DESK_PROVIDERS.filter(p => p.id !== 'custom'))('persists $id without resetting an edited URL', p => {
    const selected = applyModelPreset(profile, p.id);
    expect(selected).toMatchObject({ provider: p.id, baseUrl: p.baseUrl, protocol: p.protocol, model: '', id: 'p', name: 'My model' });
    const saved = normalizeWorkbench({ profiles: [{ ...selected, baseUrl: 'https://custom.example/v1' }] });
    expect(saved.profiles[0]).toMatchObject({ provider: p.id, baseUrl: 'https://custom.example/v1' });
  });
  it('Custom preserves the endpoint/model and old configurations remain custom', () => {
    expect(applyModelPreset(profile, 'custom')).toEqual(profile);
    expect(normalizeWorkbench({ profiles: [{ ...profile, provider: undefined }] }).profiles[0].provider).toBe('custom');
  });
  it('clears only removed or redirected credentials, preserving model/name-only edits', async () => {
    const secrets = { hasKey: () => true, setKey: vi.fn(async () => undefined) };
    await clearChangedModelKeys([profile, { ...profile, id: 'deleted' }, { ...profile, id: 'changed' }],
      [{ ...profile, model: 'new', name: 'Renamed', baseUrl: profile.baseUrl + '/' },
        { ...profile, id: 'changed', baseUrl: 'https://another.example/v1' }], secrets);
    expect(secrets.setKey.mock.calls).toEqual([['deleted', ''], ['changed', '']]);
  });
});

describe('real model connection probe', () => {
  it('sends a fixed text-only completion with the supplied credential, not desktop context', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response({ choices: [{ delta: { content: 'OK' } }] }));
    expect(await testModelConnection(profile, 'draft-key', undefined, fetcher)).toBeGreaterThanOrEqual(0);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('http://localhost:1234/v1/chat/completions');
    expect(init?.headers).toMatchObject({ authorization: 'Bearer draft-key' });
    expect(JSON.parse(String(init?.body))).toEqual({ model: 'fixture', stream: true, stream_options: { include_usage: true },
      messages: [{ role: 'system', content: 'This is a connection test. Reply with OK only.' }, { role: 'user', content: 'Reply with OK.' }] });
  });
  it('uses Anthropic Messages and checks actual streamed text', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"OK"}}\n\n'));
    await testModelConnection({ ...profile, protocol: 'anthropic' }, 'key', undefined, fetcher);
    expect(fetcher.mock.calls[0][0]).toBe('http://localhost:1234/v1/messages');
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ 'x-api-key': 'key' });
  });
  it.each([[401, 'auth'], [403, 'auth'], [429, 'rate'], [404, 'modelNotFound'], [400, 'provider'], [500, 'provider']] as const)
  ('maps HTTP %s without leaking provider error text or keys', async (status, error) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ error: { message: 'secret-key' } }), { status }));
    await expect(testModelConnection(profile, 'secret-key', undefined, fetcher)).rejects.toThrow(new Error(error));
  });
  it('does not report empty or HTML responses as a successful model connection', async () => {
    await expect(testModelConnection(profile, '', undefined, async () => new Response('<html>OK</html>'))).rejects.toThrow('emptyModelReply');
  });
  it('aborts a stalled request and reports timeout', async () => {
    const fetcher: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    });
    await expect(testModelConnection(profile, '', AbortSignal.timeout(15), fetcher)).rejects.toThrow('timeout');
  });
  it('reports network failures without exposing their raw messages', async () => {
    await expect(testModelConnection(profile, '', undefined, async () => { throw new Error('secret URL'); })).rejects.toThrow(new Error('network'));
  });
  it.each([
    [{ ...profile, model: '' }, 'testModelMissing'],
    [{ ...profile, baseUrl: 'not-a-url' }, 'invalidUrl'],
    [{ ...profile, baseUrl: 'file:///tmp/api' }, 'invalidUrl'],
    [{ ...profile, baseUrl: 'https://secret@example.com' }, 'invalidUrl'],
    [{ ...profile, baseUrl: 'https://example.com?key=secret' }, 'invalidUrl'],
    [{ ...profile, provider: 'openai', baseUrl: 'https://api.openai.com/v1' }, 'keyMissing'],
  ] as const)('validates configuration before requesting: %s', async (p, error) => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(testModelConnection(p, '', undefined, fetcher)).rejects.toThrow(error);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
