import type { BuiltinProfile } from '../../shared/teammate/settings';
import { sameModelEndpoint } from '../../shared/workbenchModels';
import { createAdapter } from '../teammate/providers';
import { ProviderError } from '../teammate/providers/types';

/** Never reuse a saved credential after redirecting a profile to another API endpoint. */
export async function clearChangedModelKeys(before: BuiltinProfile[], after: BuiltinProfile[],
  secrets: { hasKey(id: string): boolean; setKey(id: string, key: string): Promise<void> }): Promise<void> {
  for (const old of before) {
    const next = after.find(p => p.id === old.id);
    if ((!next || !sameModelEndpoint(old, next)) && secrets.hasKey(old.id)) await secrets.setKey(old.id, '');
  }
}

export function modelError(error: unknown, signal: AbortSignal): string {
  if (signal.aborted) return 'timeout';
  if (error instanceof ProviderError) {
    if (['auth', 'rate', 'network'].includes(error.kind)) return error.kind;
    if (error.status === 404) return 'modelNotFound';
    return 'provider';
  }
  return 'network';
}

/** A real text request, independent of the action runner and any desktop context. */
export async function testModelConnection(profile: BuiltinProfile, key: string,
  signal: AbortSignal = AbortSignal.timeout(30000), fetchImpl: typeof fetch = fetch): Promise<number> {
  let url: URL;
  try { url = new URL(profile.baseUrl); } catch { throw new Error('invalidUrl'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('invalidUrl');
  if (!profile.model.trim()) throw new Error('testModelMissing');
  if (!key && !['custom', 'ollama', 'lmstudio'].includes(profile.provider) && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('keyMissing');
  const start = performance.now();
  let result;
  try {
    result = await createAdapter(profile, key, fetchImpl).turn({ model: profile.model,
      system: 'This is a connection test. Reply with OK only.',
      turns: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }], tools: [] },
    { accepted: () => undefined, text: () => undefined, usage: () => undefined }, signal);
  } catch (error) { throw new Error(modelError(error, signal)); }
  if (!result.text.trim()) throw new Error('emptyModelReply');
  return Math.round(performance.now() - start);
}
