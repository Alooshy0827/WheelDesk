import { describe, expect, it } from 'vitest';
import { defaultWorkbench, newAction, normalizeWorkbench, parseShortcut, resizeWheel, setWheelEffects, validateWorkflow } from '../../src/shared/actions';
import { DEFAULT_WHEEL } from '../../src/shared/pings';

describe('workbench configuration', () => {
  it('ships two usable eight-slot wheels with independent action ids', () => {
    const settings = defaultWorkbench();
    expect(settings.wheels).toHaveLength(2);
    for (const wheel of settings.wheels) {
      expect(wheel.slots).toHaveLength(8);
      expect(wheel.slots.every(id => settings.actions.some(a => a.id === id))).toBe(true);
    }
    expect(normalizeWorkbench(settings)).toEqual(settings);
  });
  it('recovers missing settings and repairs references without reviving deleted actions', () => {
    expect(normalizeWorkbench(null)).toEqual(defaultWorkbench());
    const value = normalizeWorkbench({ activeWheelId: 'gone', actions: [], wheels: [{ id: 'w', slots: ['gone'] }] });
    expect(value.actions).toEqual([]);
    expect(value.activeWheelId).toBe('w');
    expect(value.wheels[0].slots).toEqual(Array(8).fill(null));
  });
  it('does not persist secrets or unknown settings fields', () => {
    const settings = normalizeWorkbench({ actions: [{ ...newAction('a', 'script'), timeoutS: Infinity, command: 'ignored' }],
      profiles: [{ id: 'm', name: 'Local', baseUrl: 'http://localhost:1234/v1', apiKey: 'secret' }] });
    expect(JSON.stringify(settings)).not.toContain('secret');
    expect(settings.actions[0].timeoutS).toBe(30);
    expect(settings.actions[0]).not.toHaveProperty('command');
  });
  it('removes duplicate ids and bounds wheel storage at twelve slots', () => {
    const a = newAction('a', 'ai');
    const s = normalizeWorkbench({ actions: [a, a], wheels: [{ id: 'w', slots: Array(20).fill('a') }] });
    expect(s.actions).toHaveLength(1);
    expect(s.wheels[0].slots).toHaveLength(12);
    expect(s.wheels[0].slotCount).toBe(8);
  });
  it('never turns an oversized script into a different executable program by truncation', () => {
    const source = 'echo unsafe;'.repeat(2000);
    const s = normalizeWorkbench({ actions: [{ ...newAction('a', 'script'), mac: source, windows: source }] });
    expect(s.actions[0].mac).toBe('');
    expect(s.actions[0].windows).toBe('');
  });
  it('migrates old wheels to original effects without changing their actions', () => {
    const before = defaultWorkbench();
    const wheels = before.wheels.map(({ effects: _, ...wheel }) => wheel);
    const migrated = normalizeWorkbench({ ...before, wheels });
    expect(migrated.wheels[0].effects).toEqual(DEFAULT_WHEEL);
    expect(migrated.wheels.map(w => w.slots)).toEqual(before.wheels.map(w => w.slots));
  });
  it('moves functions with dragged effects and preserves functions when replacing an effect', () => {
    const wheel = defaultWorkbench().wheels[0];
    const effects = [...wheel.effects]; [effects[0], effects[3]] = [effects[3], effects[0]];
    const moved = setWheelEffects(wheel, effects);
    expect(moved.slots[0]).toBe(wheel.slots[3]);
    expect(moved.slots[3]).toBe(wheel.slots[0]);
    const replaced = setWheelEffects(wheel, ['bait', ...wheel.effects.slice(1)]);
    expect(replaced.slots).toEqual(wheel.slots);
    expect(replaced.effects[0]).toBe('bait');
  });
  it('migrates and sanitizes per-slot names independently of action bindings', () => {
    const wb = defaultWorkbench();
    const old = wb.wheels.map(({ slotNames: _, ...w }) => w);
    expect(normalizeWorkbench({ ...wb, wheels: old })).toEqual(wb);
    const saved = normalizeWorkbench({ ...wb, wheels: [{ ...wb.wheels[0], slotNames: ['  我的名称  ', null, ' ', 'x'.repeat(100), 'a\nb'] }] });
    expect(saved.wheels[0].slotNames.slice(0, 5)).toEqual(['我的名称', '', '', 'x'.repeat(80), 'a b']);
    expect(saved.wheels[0].slots).toEqual(wb.wheels[0].slots);
    expect(normalizeWorkbench(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });
  it('moves names with slots and retains them on artwork replacement and count changes', () => {
    const wb = defaultWorkbench();
    const wheel = resizeWheel(wb.wheels[0], 12);
    wheel.slotNames[0] = 'first'; wheel.slotNames[3] = 'fourth'; wheel.slotNames[11] = 'hidden';
    const effects = [...wheel.effects]; [effects[0], effects[3]] = [effects[3], effects[0]];
    const swapped = setWheelEffects(wheel, effects);
    expect(swapped.slotNames[0]).toBe('fourth'); expect(swapped.slotNames[3]).toBe('first');
    const smaller = resizeWheel(swapped, 4);
    const replaced = setWheelEffects(smaller, ['assist', ...smaller.effects.slice(1, 4)]);
    expect(replaced.slotNames).toEqual(smaller.slotNames);
    const restored = resizeWheel(normalizeWorkbench({ ...wb, wheels: [replaced] }).wheels[0], 12);
    expect(restored.slotNames).toEqual(swapped.slotNames);
    const duplicate = structuredClone(restored); duplicate.slotNames[0] = 'another wheel';
    expect(restored.slotNames[0]).toBe('fourth');
  });
  it('repairs unknown and duplicate effects to eight unique built-in effects', () => {
    const s = defaultWorkbench();
    const normalized = normalizeWorkbench({ ...s, wheels: [{ ...s.wheels[0], effects: ['missing', 'missing', 'bad'] }] });
    expect(new Set(normalized.wheels[0].effects).size).toBe(8);
    expect(normalized.wheels[0].effects[0]).toBe('missing');
    expect(normalized.wheels[0].slots).toEqual(s.wheels[0].slots);
  });
  it('preserves every function when resetting a wheel with moved and replacement effects', () => {
    const wheel = defaultWorkbench().wheels[0];
    const swapped = setWheelEffects(wheel, ['push', 'danger', ...wheel.effects.slice(2)]);
    const replaced = setWheelEffects(swapped, ['bait', ...swapped.effects.slice(1)]);
    const reset = setWheelEffects(replaced, DEFAULT_WHEEL);
    expect(reset.effects).toEqual(DEFAULT_WHEEL);
    expect(reset.slots).toEqual(wheel.slots);
  });
  it('migrates older configurations to eight spokes without changing bindings', () => {
    const wb = defaultWorkbench();
    const wheels = wb.wheels.map(({ slotCount: _, ...w }) => w);
    expect(normalizeWorkbench({ ...wb, wheels })).toEqual(wb);
  });
  it('persists hidden bindings and restores them after shrinking and expanding', () => {
    const wb = defaultWorkbench();
    const original = resizeWheel(wb.wheels[0], 12);
    original.slots[11] = 'copy';
    const saved = normalizeWorkbench(JSON.parse(JSON.stringify({ ...wb, wheels: [resizeWheel(original, 3)] })));
    expect(saved.wheels[0].slotCount).toBe(3);
    expect(resizeWheel(saved.wheels[0], 12)).toEqual(original);
    expect(saved.wheels[0].slots.slice(8, 11)).toEqual([null, null, null]);
  });
  it('reorders only visible bindings and preserves hidden functions when reusing their artwork', () => {
    const wheel = resizeWheel(defaultWorkbench().wheels[0], 4);
    const changed = setWheelEffects(wheel, ['assist', 'omw', 'push', 'allin']);
    expect(changed.slots.slice(0, 4)).toEqual(['copy', 'selectAll', 'paste', 'undo']);
    expect(changed.slots.slice(4)).toEqual(wheel.slots.slice(4));
    expect(new Set(changed.effects).size).toBe(changed.effects.length);
    expect(changed.slotCount).toBe(4);
    expect(setWheelEffects(changed, DEFAULT_WHEEL.slice(0, 4)).slots.slice(4)).toEqual(wheel.slots.slice(4));
  });
  it.each([[0, 2], [99, 12], [5.6, 6], [NaN, 8], ['12', 8]])('repairs spoke count %s to %s', (raw, count) => {
    const wb = defaultWorkbench();
    const s = normalizeWorkbench({ ...wb, wheels: [{ ...wb.wheels[0], slotCount: raw }] });
    expect(s.wheels[0].slotCount).toBe(count);
    expect(s.wheels[0].effects.length).toBeGreaterThanOrEqual(Number(count));
    expect(s.wheels[0].effects.length).toBe(s.wheels[0].slots.length);
    expect(s.wheels[0].slots.slice(0, 8)).toEqual(wb.wheels[0].slots);
  });
});
describe('workflow validation', () => {
  it('rejects image input to scripts before running any steps', () => {
    const s = defaultWorkbench(); s.actions.push(newAction('script', 'script'));
    expect(validateWorkflow({ id: 'w', name: 'w', steps: [
      { id: '1', actionId: 'capture', input: 'none' }, { id: '2', actionId: 'script', input: 'previous' },
    ] }, s)).toEqual([{ step: 1, code: 'image' }]);
  });
  it('allows screenshots to feed AI and the resulting text to feed scripts', () => {
    const s = defaultWorkbench(); s.actions.push(newAction('script', 'script'));
    expect(validateWorkflow({ id: 'w', name: 'w', steps: [
      { id: '1', actionId: 'capture', input: 'none' }, { id: '2', actionId: 'vision', input: 'previous' },
      { id: '3', actionId: 'script', input: 'previous' },
    ] }, s)).toEqual([]);
  });
  it('rejects nested, missing and first-step previous references', () => {
    const s = defaultWorkbench(); s.actions.push(newAction('nested', 'workflow'));
    const errors = validateWorkflow({ id: 'w', name: '', steps: [
      { id: '1', actionId: 'polish', input: 'previous' }, { id: '2', actionId: 'deleted', input: 'none' },
      { id: '3', actionId: 'nested', input: 'none' },
    ] }, s);
    expect(errors.map(e => e.code)).toEqual(['previous', 'missing', 'nested']);
  });
});
describe('portable shortcuts', () => {
  it('maps Primary to the platform while preserving other modifiers', () => {
    expect(parseShortcut('Primary+Shift+V', true)).toEqual({ vk: 86, mods: 12 });
    expect(parseShortcut('Primary+Shift+V', false)).toEqual({ vk: 86, mods: 5 });
    expect(parseShortcut('Alt+Tab', false)).toEqual({ vk: 9, mods: 2 });
    expect(parseShortcut('F12', false)).toEqual({ vk: 123, mods: 0 });
  });
  it('rejects unknown keys and modifiers', () => {
    for (const value of ['Primary+', 'Bad+C', 'F99', 'A+B', '']) expect(parseShortcut(value, true)).toBeNull();
  });
});
