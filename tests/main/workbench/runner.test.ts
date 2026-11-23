import { describe, expect, it } from 'vitest';
import { ActionRunner, type RunnerDeps } from '../../../src/main/workbench/runner';
import { defaultWorkbench, newAction, type ActionValue, type RunState } from '../../../src/shared/actions';
const target = { window: '123', selection: '', x: 0, y: 0 };
function setup(execute?: RunnerDeps['execute']) {
  const states: RunState[] = [];
  const runner = new ActionRunner({ publish: s => states.push(s),
    input: async (source, previous) => source === 'previous' ? previous : { text: 'start' },
    execute: execute ?? (async (a, input) => ({ text: input.text + a.value })),
  });
  const settings = defaultWorkbench();
  settings.actions.push({ ...newAction('one', 'script'), value: '-one' }, { ...newAction('two', 'script'), value: '-two' },
    { ...newAction('flow', 'workflow'), value: 'f' });
  settings.workflows.push({ id: 'f', name: 'f', steps: [
    { id: '1', actionId: 'one', input: 'none' }, { id: '2', actionId: 'two', input: 'previous' },
  ] });
  return { runner, states, settings };
}
describe('ActionRunner', () => {
  it('passes the first result into the second step', async () => {
    const { runner, settings, states } = setup();
    await runner.run('flow', settings, target);
    expect(runner.state.text).toBe('start-one-two');
    expect(runner.state.status).toBe('completed');
    expect(states.some(s => s.step === 2 && s.status === 'running')).toBe(true);
  });
  it('runs a workflow with no proxy action and ignores obsolete screenshot input', async () => {
    const { settings } = setup();
    settings.workflows[0].steps = [{ id: '1', actionId: 'capture', input: 'previous' }];
    settings.actions = settings.actions.filter(a => a.kind !== 'workflow');
    const captures: string[] = [];
    const runner = new ActionRunner({ publish: () => {},
      input: async () => { throw new Error('unexpected input prompt'); },
      execute: async action => { captures.push(action.id); return {}; },
    });
    await runner.run('workflow:f', settings, target);
    expect(runner.state).toMatchObject({ status: 'completed', name: 'f' });
    settings.actions = settings.actions.map(a => a.id === 'capture' ? { ...a, input: 'screenshot' } : a);
    await runner.run('capture', settings, target);
    expect(runner.state.status).toBe('completed');
    expect(captures).toEqual(['capture', 'capture']);
  });
  it('stops at a failed step and preserves streamed partial output', async () => {
    const ran: string[] = [];
    const { runner, settings } = setup(async (a, _, ctx) => { ran.push(a.id); ctx.delta('partial'); throw new Error('network'); });
    await runner.run('flow', settings, target);
    expect(ran).toEqual(['one']);
    expect(runner.state).toMatchObject({ status: 'failed', error: 'network', text: 'partial' });
  });
  it('rejects an invalid later step before earlier side effects', async () => {
    const { runner, settings, states } = setup();
    settings.workflows[0].steps[1].actionId = 'gone';
    await expect(runner.run('flow', settings, target)).rejects.toThrow('workflowInvalid');
    expect(states).toEqual([]);
  });
  it('uses an immutable configuration snapshot throughout the run', async () => {
    let ready: () => void = () => undefined;
    const gate = new Promise<void>(r => { ready = r; });
    const { runner, settings } = setup(async (a, input) => { await gate; return { text: input.text + a.value }; });
    const done = runner.run('flow', settings, target);
    const second = settings.actions.find(a => a.id === 'two'); if (second) second.value = '-changed';
    ready(); await done;
    expect(runner.state.text).toBe('start-one-two');
  });
  it('cancels an active step and refuses overlapping runs', async () => {
    let began: () => void = () => undefined;
    const started = new Promise<void>(r => { began = r; });
    const { runner, settings } = setup(async (_, __, ctx) => {
      began(); return new Promise<ActionValue>((_resolve, reject) => ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason), { once: true }));
    });
    const done = runner.run('flow', settings, target); await started;
    await expect(runner.run('one', settings, target)).rejects.toThrow('busy');
    runner.cancel(); await done;
    expect(runner.state.status).toBe('cancelled'); expect(runner.busy).toBe(false);
  });
  it('accumulates usage and completes text independently of tool calls', async () => {
    const { runner, settings } = setup(async (_, __, ctx) => { ctx.delta('hello'); ctx.usage(5, 3); return { text: 'hello' }; });
    await runner.run('flow', settings, target);
    expect(runner.state).toMatchObject({ text: 'hello', inputTokens: 10, outputTokens: 6, status: 'completed' });
  });
});
