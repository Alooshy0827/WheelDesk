import { PROVIDERS } from './teammate/providers';
import type { BuiltinProfile } from './teammate/settings';

const ids = ['openai', 'anthropic', 'deepseek', 'qwen', 'kimi', 'gemini', 'ollama', 'lmstudio', 'custom'];
export const DESK_PROVIDERS = ids.flatMap(id => PROVIDERS.filter(p => p.id === id));

/** Choosing Custom preserves the endpoint; choosing a vendor starts with its documented defaults. */
export function applyModelPreset(profile: BuiltinProfile, id: string): BuiltinProfile {
  const preset = DESK_PROVIDERS.find(p => p.id === id);
  if (!preset) return profile;
  return preset.id === 'custom' ? { ...profile, provider: 'custom' }
    : { ...profile, provider: preset.id, protocol: preset.protocol, baseUrl: preset.baseUrl, model: '' };
}

export function sameModelEndpoint(a: BuiltinProfile, b: BuiltinProfile): boolean {
  const clean = (url: string) => url.trim().replace(/\/+$/, '');
  return a.protocol === b.protocol && clean(a.baseUrl) === clean(b.baseUrl);
}
