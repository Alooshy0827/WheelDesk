import { describe, expect, it } from 'vitest';
import { ActionRunner } from '../../../src/main/workbench/runner';
import { shouldShowRun } from '../../../src/main/workbench/presentation';
import { defaultWorkbench, newAction, type ActionKind } from '../../../src/shared/actions';

describe('action result visibility', () => {
  const target = { window: '', selection: '', x: 0, y: 0 };
  it.each<ActionKind>(['shortcut', 'openPath', 'openUrl', 'writeClipboard', 'pasteText', 'switchWheel', 'delay'])(
    'does not request a result window for %s, even when data is returned', async kind => {
      const settings = defaultWorkbench(); settings.actions.push(newAction('test', kind));
      const visible: boolean[] = [];
      const runner = new ActionRunner({ input: async () => ({}), execute: async () => ({ text: 'data' }),
        publish: run => visible.push(shouldShowRun(run, runner.presentation)) });
      await runner.run('test', settings, target);
      expect(visible.every(v => !v)).toBe(true);
    });
  it.each(['card', 'copy', 'paste'] as const)('respects AI output mode %s while streaming and on completion', async output => {
    const settings = defaultWorkbench(); settings.actions.push({ ...newAction('test', 'ai'), output });
    const visible: boolean[] = [];
    const runner = new ActionRunner({ input: async () => ({}), execute: async (_, __, ctx) => {
      ctx.delta('answer'); return { text: 'answer' };
    }, publish: run => visible.push(shouldShowRun(run, runner.presentation)) });
    await runner.run('test', settings, target);
    expect(visible.every(v => v === (output === 'card'))).toBe(true);
  });
  it('shows failures of silent actions and allows workflow progress without a completion popup', async () => {
    const settings = defaultWorkbench();
    settings.actions.push({ ...newAction('flow', 'workflow'), value: 'f' });
    settings.workflows.push({ id: 'f', name: '', steps: [{ id: 's', actionId: 'downloads', input: 'none' }] });
    const visible: boolean[] = [];
    let fail = false;
    const runner = new ActionRunner({ input: async () => ({}), execute: async () => {
      if (fail) throw new Error('target'); return {};
    }, publish: run => visible.push(shouldShowRun(run, runner.presentation)) });
    await runner.run('flow', settings, target);
    expect(visible[0]).toBe(true); expect(visible.at(-1)).toBe(false);
    fail = true; visible.length = 0;
    await runner.run('downloads', settings, target);
    expect(visible[0]).toBe(false); expect(visible.at(-1)).toBe(true);
  });
});
