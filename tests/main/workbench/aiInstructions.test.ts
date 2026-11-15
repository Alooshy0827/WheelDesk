import { describe, expect, it, vi } from 'vitest';
import { actionProfile, applyPreparedInstruction, INTERPRET_SYSTEM, prepareInstruction } from '../../../src/main/workbench/aiInstructions';
import { defaultWorkbench, hasPreparedInstruction, newAction, normalizeWorkbench } from '../../../src/shared/actions';
import type { BuiltinProfile } from '../../../src/shared/teammate/settings';

const profile: BuiltinProfile = { id: 'p', name: 'Fixture', kind: 'builtin', provider: 'custom', protocol: 'openai',
  baseUrl: 'http://localhost:1234/v1', model: 'fixture', tagColor: 3, tagColorCustom: null };
const action = () => ({ ...newAction('custom', 'ai'), aiCustom: {
  description: '把输入整理成三条中文要点', source: '', instruction: '', feedback: '',
} });
const fixture = (text = 'Extract exactly three concise Chinese bullet points from each input.') =>
  vi.fn<typeof fetch>(async () => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }],
    usage: { prompt_tokens: 10, completion_tokens: 8 } })}\n\ndata: [DONE]\n\n`));
const signal = () => new AbortController().signal;

describe('reusable AI instructions', () => {
  it('prepares configuration only, persists it, and skips the next preparation after reload', async () => {
    const a = action(), fetcher = fixture(), usage = vi.fn();
    const prepared = await prepareInstruction(a, profile, 'fixture-key', signal(), false, usage, fetcher);
    expect(hasPreparedInstruction(prepared)).toBe(true);
    expect(usage).toHaveBeenCalledWith(10, 8);
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.messages).toEqual([{ role: 'system', content: INTERPRET_SYSTEM }, { role: 'user',
      content: JSON.stringify({ description: a.aiCustom.description, previousInstruction: '', feedback: '' }) }]);
    expect(body.tools).toBeUndefined();
    const snapshot = { ...defaultWorkbench(), actions: [a], profiles: [profile], defaultProfileId: 'p' };
    const saved = applyPreparedInstruction(snapshot, snapshot, a, prepared);
    const reloaded = normalizeWorkbench(JSON.parse(JSON.stringify(saved)));
    expect(await prepareInstruction(reloaded.actions[0], profile, '', signal(), false, usage, fetcher)).toEqual(prepared);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a.aiCustom.instruction).toBe('');
  });
  it('invalidates on exact description changes and only includes prior edits for explicit revision', async () => {
    const a = action(), fetcher = fixture();
    a.aiCustom = await prepareInstruction(a, profile, '', signal(), false, undefined, fetcher);
    a.aiCustom.description += '，每条不超过十字';
    a.aiCustom.feedback = '更简短';
    expect(hasPreparedInstruction(a.aiCustom)).toBe(false);
    await prepareInstruction(a, profile, '', signal(), false, undefined, fetcher);
    const fresh = JSON.parse(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).messages[1].content);
    expect(fresh.previousInstruction).toBe('');
    expect(fresh.feedback).toBe('');
    await prepareInstruction(a, profile, '', signal(), true, undefined, fetcher);
    const revised = JSON.parse(JSON.parse(String(fetcher.mock.calls[2][1]?.body)).messages[1].content);
    expect(revised).toMatchObject({ previousInstruction: a.aiCustom.instruction, feedback: '更简短' });
  });
  it('reuses manually edited instructions even if model or feedback changes', async () => {
    const a = action(), fetcher = fixture();
    a.aiCustom = { ...a.aiCustom, source: a.aiCustom.description, instruction: 'My edited instruction', feedback: 'Pending feedback' };
    expect(await prepareInstruction(a, { ...profile, model: 'another' }, '', signal(), false, undefined, fetcher)).toEqual(a.aiCustom);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([401, 429, 500])('preserves old understanding on HTTP %s without leaking server text', async status => {
    const a = action(); a.aiCustom.instruction = 'Previous valid instruction';
    const before = structuredClone(a);
    const fetcher: typeof fetch = async () => new Response('secret-key', { status });
    await expect(prepareInstruction(a, profile, '', signal(), true, undefined, fetcher))
      .rejects.toThrow(new Error(status === 401 ? 'auth' : status === 429 ? 'rate' : 'provider'));
    expect(a).toEqual(before);
  });
  it.each(['', 'x'.repeat(20001)])('rejects empty or oversized results', async text => {
    await expect(prepareInstruction(action(), profile, '', signal(), true, undefined, fixture(text)))
      .rejects.toThrow(text ? 'invalidInterpretation' : 'emptyModelReply');
  });
  it('aborts stalled interpretation for cancellation and timeout', async () => {
    const fetcher: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    });
    const controller = new AbortController();
    const pending = prepareInstruction(action(), profile, '', controller.signal, true, undefined, fetcher);
    controller.abort();
    await expect(pending).rejects.toThrow('cancelled');
    await expect(prepareInstruction(action(), profile, '', AbortSignal.timeout(10), true, undefined, fetcher)).rejects.toThrow('timeout');
  });
  it('rejects missing descriptions without making a request', async () => {
    const a = action(); a.aiCustom.description = ' ';
    const fetcher = fixture();
    await expect(prepareInstruction(a, profile, '', signal(), false, undefined, fetcher)).rejects.toThrow('descriptionMissing');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('merges into current settings but refuses stale responses after edits/deletion/model changes', async () => {
    const a = action(), original = { ...defaultWorkbench(), actions: [a], profiles: [profile], defaultProfileId: 'p' };
    const prepared = await prepareInstruction(a, profile, '', signal(), false, undefined, fixture());
    const renamed = structuredClone(original); renamed.wheels[0].name = 'Keep this edit';
    expect(applyPreparedInstruction(renamed, original, a, prepared).wheels[0].name).toBe('Keep this edit');
    for (const mutate of [
      (w: typeof original) => { w.actions[0].aiCustom.description += '!'; },
      (w: typeof original) => { w.actions[0].aiCustom.instruction = 'My concurrent edit'; },
      (w: typeof original) => { w.actions = []; },
      (w: typeof original) => { w.profiles[0].model = 'changed'; },
    ]) {
      const current = structuredClone(original); mutate(current);
      expect(() => applyPreparedInstruction(current, original, a, prepared)).toThrow('instructionChanged');
    }
    expect(actionProfile(a, original)).toEqual(profile);
  });
  it('normalizes cache fields without adding them to existing direct prompts', () => {
    expect(normalizeWorkbench(defaultWorkbench())).toEqual(defaultWorkbench());
    const a = action();
    a.aiCustom = { description: 'Describe', source: 'Describe', instruction: 'x'.repeat(20001), feedback: 'x'.repeat(5000) };
    const custom = normalizeWorkbench({ actions: [a] }).actions[0].aiCustom;
    expect(custom?.instruction).toBe('');
    expect(custom?.feedback).toHaveLength(4000);
  });
});
