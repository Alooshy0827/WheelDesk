import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeskOverlay, DeskState } from '../../src/shared/ipc';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';
import { idleRun, resizeWheel } from '../../src/shared/actions';
import { DesktopSurfaces } from '../../src/main/workbench/surfaces';

const h = vi.hoisted(() => ({
  windows: [] as Array<{
    webContents: { id: number; send: ReturnType<typeof vi.fn> };
    visible: boolean; focusable: boolean; ignore: boolean;
  }>,
  displays: [
    { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
    { id: 2, bounds: { x: 1920, y: 0, width: 1280, height: 1024 }, scaleFactor: 2 },
  ],
}));
vi.mock('electron', () => {
  class Window {
    webContents = { id: h.windows.length + 10, send: vi.fn(), setWindowOpenHandler: vi.fn(), setBackgroundThrottling: vi.fn(), on: vi.fn() };
    visible = false; focusable = false; ignore = true;
    constructor() { h.windows.push(this); }
    loadURL() { return Promise.resolve(); }
    setBounds() {}
    setIgnoreMouseEvents(v: boolean) { this.ignore = v; }
    setFocusable(v: boolean) { this.focusable = v; }
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    isDestroyed() { return false; }
    destroy() {}
    showInactive() { this.visible = true; }
    show() { this.visible = true; }
    hide() { this.visible = false; }
  }
  return { BrowserWindow: Window, screen: {
    getAllDisplays: () => h.displays,
    dipToScreenRect: (_: unknown, b: typeof h.displays[0]['bounds']) => b.x === 0 ? b : { ...b, width: b.width * 2, height: b.height * 2 },
    getCursorScreenPoint: () => ({ x: 300, y: 300 }),
    getDisplayNearestPoint: () => h.displays[0],
  } };
});

let state: DeskState;
let surfaces: DesktopSurfaces;
const chosen = vi.fn();
const opened = vi.fn();
const events = (display = 0): DeskOverlay[] => h.windows[display].webContents.send.mock.calls.map(c => c[1] as DeskOverlay);
const effects = (display = 0) => events(display).filter(e => e.type === 'effect');
const gesture = async (x = 500, y = 500) => {
  surfaces.handle({ type: 'wheelOpen', wheel: 'ping', x, y });
  await Promise.resolve();
};
const release = (x = 500, y = 300) => surfaces.handle({ type: 'wheelRelease', wheel: 'ping', x, y });
beforeEach(() => {
  h.windows.length = 0; chosen.mockClear(); opened.mockClear();
  state = { settings: structuredClone(DEFAULT_SETTINGS), lang: 'en', platform: 'mac', helper: 'running', run: idleRun(), keyIds: [] };
  surfaces = new DesktopSurfaces(true, () => state, opened, chosen);
});

describe('original effects with custom functions', () => {
  it.each([2, 3, 4, 6, 9, 12])('snapshots %i active spokes and ignores a later count change', async count => {
    const wheel = resizeWheel(state.settings.workbench.wheels[0], count);
    wheel.slots[count - 1] = 'capture';
    state.settings.workbench.wheels[0] = wheel;
    await gesture();
    expect(events().find(e => e.type === 'open')?.effects).toHaveLength(count);
    expect(events().find(e => e.type === 'open')?.labels).toHaveLength(count);
    state.settings.workbench.wheels[0] = resizeWheel(wheel, count === 2 ? 12 : 2);
    const rad = (count - 1) * 2 * Math.PI / count;
    release(Math.round(500 + 200 * Math.sin(rad)), Math.round(500 - 200 * Math.cos(rad)));
    expect(chosen).toHaveBeenCalledExactlyOnceWith('capture', { x: 500, y: 500 });
    expect(effects()[0]?.effect).toBe(wheel.effects[count - 1]);
  });
  it('plays effects on newly added spokes without executing a function', async () => {
    state.settings.workbench.wheels[0] = resizeWheel(state.settings.workbench.wheels[0], 12);
    await gesture();
    expect(events().find(e => e.type === 'open')?.enabled?.slice(8)).toEqual([true, true, true, true]);
    release(300, 500); // W is index 9 on a 12-spoke wheel, one of the new empty slots.
    expect(chosen).not.toHaveBeenCalled();
    expect(effects()).toHaveLength(1);
    expect(effects()[0]?.effect).toBe(state.settings.workbench.wheels[0].effects[9]);
  });
  it('plays the selected effect and executes its independently bound action exactly once', async () => {
    state.settings.workbench.wheels[0].effects[0] = 'allin';
    await gesture(); release(); release();
    expect(chosen).toHaveBeenCalledExactlyOnceWith('capture', { x: 500, y: 500 });
    expect(effects()).toEqual([expect.objectContaining({ effect: 'allin', name: 'Capture region', x: 500, y: 500 })]);
    expect(h.windows[0].visible).toBe(true);
    surfaces.idle(h.windows[0].webContents.id, true);
    expect(h.windows[0].visible).toBe(false);
  });
  it('keeps the effect, action, label and scale from this gesture when settings change', async () => {
    await gesture();
    state.settings.workbench.wheels[0].effects[0] = 'allin';
    state.settings.workbench.wheels[0].slots[0] = 'plainPaste';
    state.settings.workbench.activeWheelId = 'ai';
    state.settings.wheelSizePx = 900;
    release(500, 400);
    expect(chosen).toHaveBeenCalledExactlyOnceWith('capture', { x: 500, y: 500 });
    expect(effects()[0]).toMatchObject({ effect: 'danger', name: 'Capture region', visual: { wheelSizePx: DEFAULT_SETTINGS.wheelSizePx } });
  });
  it('plays an unbound slot once, but not for cancellation or the center', async () => {
    state.settings.workbench.wheels[0].slots[0] = null;
    await gesture();
    expect(events().find(e => e.type === 'open')?.enabled?.[0]).toBe(true);
    release(); release();
    expect(effects()).toEqual([expect.objectContaining({ effect: 'danger', name: 'Danger' })]);
    await gesture(); surfaces.handle({ type: 'cancel' }); release();
    await gesture(); release(500, 500);
    expect(chosen).not.toHaveBeenCalled(); expect(effects()).toHaveLength(1);
  });
  it('keeps an unbound slot and localized effect name from the gesture snapshot', async () => {
    state.lang = 'zh-CN';
    state.settings.workbench.wheels[0].slots[0] = null;
    state.settings.workbench.wheels[0].effects[0] = 'allin';
    await gesture();
    expect(events().find(e => e.type === 'open')?.labels?.[0]).toBe('全力进攻');
    state.settings.workbench.wheels[0].slots[0] = 'capture';
    state.settings.workbench.wheels[0].effects[0] = 'danger';
    release();
    expect(chosen).not.toHaveBeenCalled();
    expect(effects()).toEqual([expect.objectContaining({ effect: 'allin', name: '全力进攻' })]);
  });
  it.each(['capture', null])('uses the custom name for binding %s and snapshots it for the effect', async binding => {
    const wheel = state.settings.workbench.wheels[0];
    wheel.slots[0] = binding;
    wheel.slotNames[0] = 'My <custom> name';
    await gesture();
    expect(events().find(e => e.type === 'open')?.labels?.[0]).toBe('My <custom> name');
    wheel.slotNames[0] = 'changed during gesture';
    release();
    expect(effects()[0]?.name).toBe('My <custom> name');
    expect(chosen).toHaveBeenCalledTimes(binding ? 1 : 0);
  });
  it('matches the original wheel dead zone at the configured scale', async () => {
    state.settings.wheelSizePx = 900;
    await gesture(); release(500, 380); // 120 < 86 * 900 / 600
    expect(chosen).not.toHaveBeenCalled();
    await gesture(); release(500, 360);
    expect(chosen).toHaveBeenCalledOnce();
  });
  it('keeps coordinates and selection correct on a scaled secondary Windows display', async () => {
    surfaces = new DesktopSurfaces(false, () => state, opened, chosen);
    await gesture(2320, 600); release(2320, 300);
    expect(events(1).find(e => e.type === 'open')).toMatchObject({ x: 200, y: 300 });
    expect(effects(1)[0]).toMatchObject({ x: 200, y: 300, effect: 'danger' });
    expect(chosen).toHaveBeenCalledExactlyOnceWith('capture', { x: 2320, y: 600 });
    expect(effects(0)).toEqual([]);
  });
  it('previews an original effect without opening or running any action', async () => {
    await surfaces.preview('allin'); await surfaces.preview('not-a-ping');
    expect(effects()).toEqual([expect.objectContaining({ effect: 'allin', x: 300, y: 300 })]);
    expect(chosen).not.toHaveBeenCalled(); expect(opened).not.toHaveBeenCalled();
    await gesture(); await surfaces.preview('danger');
    expect(effects()).toHaveLength(1);
    surfaces.idle(h.windows[0].webContents.id, true);
    expect(h.windows[0].visible).toBe(true);
  });
  it('drops an unfinished wheel open when the gesture ends before the renderer loads', async () => {
    surfaces.handle({ type: 'wheelOpen', wheel: 'ping', x: 500, y: 500 });
    surfaces.handle({ type: 'cancel' });
    await Promise.resolve();
    expect(events().filter(e => e.type === 'open')).toEqual([]);
    expect(chosen).not.toHaveBeenCalled();
  });
  it('clears effects before capture and resets all overlays after selecting a region', async () => {
    const selected = surfaces.selectRegion(new AbortController().signal);
    await Promise.resolve(); await Promise.resolve();
    expect(events().at(-1)?.type).toBe('capture');
    surfaces.handle({ type: 'cancel' }); // the hook must not dismiss the active region picker
    surfaces.idle(h.windows[0].webContents.id, true);
    expect(h.windows[0].visible).toBe(true);
    surfaces.captureReply(h.windows[0].webContents.id, { x: 10, y: 20, w: 100, h: 80 });
    expect((await selected).rect).toEqual({ x: 10, y: 20, w: 100, h: 80 });
    for (let i = 0; i < h.windows.length; i++) {
      expect(events(i).at(-1)).toEqual({ type: 'close', clear: true });
      expect(h.windows[i]).toMatchObject({ visible: false, focusable: false, ignore: true });
    }
  });
  it('cancels a capture on immediate dismissal and leaves no stale capture UI', async () => {
    const selected = surfaces.selectRegion(new AbortController().signal);
    const rejected = expect(selected).rejects.toThrow('cancelled');
    await Promise.resolve(); await Promise.resolve();
    surfaces.cancel(true); await rejected;
    expect(events().at(-1)).toEqual({ type: 'close', clear: true });
    expect(h.windows[0].visible).toBe(false);
  });
});
