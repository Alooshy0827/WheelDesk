import { BrowserWindow, screen, type Display } from 'electron';
import { join } from 'node:path';
import { DESK_CH, type DeskOverlay, type DeskState, type Point } from '../../shared/ipc';
import { pickSlice } from '../../shared/geometry';
import { WHEEL_CENTER_RADIUS } from '../../shared/actions';
import { physicalToDip, type DisplayMap } from '../coords';
import type { HelperEvent } from '../../shared/protocol';

export type SurfaceRole = 'settings' | 'result' | 'overlay';
export function loadDesk(win: BrowserWindow, role: SurfaceRole): Promise<void> {
  const dev = process.env.ELECTRON_RENDERER_URL;
  return dev ? win.loadURL(`${dev}/workbench/index.html#${role}`)
    : win.loadFile(join(__dirname, '../renderer/workbench/index.html'), { hash: role });
}
export function deskWindow(options: Electron.BrowserWindowConstructorOptions): BrowserWindow {
  const win = new BrowserWindow({ backgroundColor: '#f6f7f9', show: false, autoHideMenuBar: true, ...options,
    webPreferences: { preload: join(__dirname, '../preload/workbench.js'), sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  return win;
}
export class DesktopSurfaces {
  private overlays = new Map<number, BrowserWindow>();
  private ready = new Map<number, Promise<void>>();
  private maps: DisplayMap[] = [];
  private gesture: { serial: number; displayId: number; origin: Point; slots: (string | null)[] } | null = null;
  private serial = 0;
  private capturePending: { resolve: (v: { display: DisplayMap; rect: { x: number; y: number; w: number; h: number } }) => void;
    reject: (error: Error) => void } | null = null;
  constructor(private readonly mac: boolean, private readonly state: () => DeskState,
    private readonly opened: (point: Point) => void, private readonly chosen: (id: string, point: Point) => void) {}
  role(id: number): boolean { return [...this.overlays.values()].some(w => w.webContents.id === id); }
  private send(id: number, event: DeskOverlay): void {
    const win = this.overlays.get(id);
    if (win && !win.isDestroyed()) win.webContents.send(DESK_CH.overlay, event);
  }
  refresh(): void {
    const displays = screen.getAllDisplays();
    this.maps = displays.map(d => ({ id: d.id, dip: d.bounds,
      phys: this.mac ? d.bounds : screen.dipToScreenRect(null, d.bounds), scale: this.mac ? 1 : d.scaleFactor }));
    for (const [id, win] of this.overlays) {
      if (!displays.some(d => d.id === id)) { win.destroy(); this.overlays.delete(id); this.ready.delete(id); }
    }
    for (const display of displays) {
      const existing = this.overlays.get(display.id);
      if (existing) { existing.setBounds(display.bounds); continue; }
      this.create(display);
    }
  }
  private create(d: Display): void {
    const win = deskWindow({ ...d.bounds, frame: false, transparent: true, backgroundColor: '#00000000',
      focusable: false, resizable: false, movable: false, minimizable: false, maximizable: false,
      fullscreenable: false, hasShadow: false, skipTaskbar: true, alwaysOnTop: true, enableLargerThanScreen: true });
    win.setIgnoreMouseEvents(true);
    win.setAlwaysOnTop(true, 'screen-saver');
    if (this.mac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.overlays.set(d.id, win);
    this.ready.set(d.id, loadDesk(win, 'overlay'));
  }
  handle(event: HelperEvent): void {
    if (event.type === 'cancel') { this.cancel(); return; }
    if (event.type === 'wheelOpen') {
      this.refresh();
      const p = physicalToDip(event.x, event.y, this.maps);
      if (!p || this.capturePending) return;
      const { settings, lang } = this.state();
      const wb = settings.workbench;
      const wheel = wb.wheels.find(w => w.id === wb.activeWheelId);
      if (!wheel) return;
      this.cancel();
      const serial = ++this.serial;
      this.gesture = { serial, displayId: p.display.id, origin: { x: p.x, y: p.y }, slots: [...wheel.slots] };
      this.opened({ x: event.x, y: event.y });
      const items = wheel.slots.map(id => wb.actions.find(a => a.id === id));
      void this.ready.get(p.display.id)?.then(() => {
        if (this.gesture?.serial !== serial) return;
        this.send(p.display.id, { type: 'open', x: p.x - p.display.dip.x, y: p.y - p.display.dip.y,
          name: lang === 'en' ? wheel.nameEn || wheel.name : wheel.name, lang,
          labels: items.map(a => a ? lang === 'en' ? a.nameEn || a.name : a.name : ''), kinds: items.map(a => a?.kind ?? '') });
        this.overlays.get(p.display.id)?.showInactive();
      });
      return;
    }
    const g = this.gesture;
    if (!g || (event.type !== 'wheelMove' && event.type !== 'wheelRelease')) return;
    const p = physicalToDip(event.x, event.y, this.maps);
    const map = this.maps.find(m => m.id === g.displayId);
    if (!p || !map) { this.cancel(); return; }
    if (event.type === 'wheelMove') this.send(g.displayId, { type: 'move', x: p.x - map.dip.x, y: p.y - map.dip.y });
    else {
      const index = pickSlice(p.x - g.origin.x, p.y - g.origin.y, WHEEL_CENTER_RADIUS);
      const actionId = index >= 0 ? g.slots[index] : null;
      this.cancel();
      if (actionId) this.chosen(actionId, { x: map.phys.x + (g.origin.x - map.dip.x) * map.scale,
        y: map.phys.y + (g.origin.y - map.dip.y) * map.scale });
    }
  }
  cancel(): void {
    this.gesture = null;
    for (const [id, win] of this.overlays) { this.send(id, { type: 'close' }); win.hide(); }
  }
  async selectRegion(signal: AbortSignal): Promise<{ display: DisplayMap; rect: { x: number; y: number; w: number; h: number } }> {
    this.cancel(); this.refresh();
    signal.throwIfAborted();
    await Promise.all(this.ready.values());
    signal.throwIfAborted();
    try {
      return await new Promise((resolve, reject) => {
        const abort = () => reject(new Error('cancelled'));
        signal.addEventListener('abort', abort, { once: true });
        this.capturePending = { resolve: value => { signal.removeEventListener('abort', abort); resolve(value); },
          reject: error => { signal.removeEventListener('abort', abort); reject(error); } };
        for (const [id, win] of this.overlays) {
          win.setFocusable(true); win.setIgnoreMouseEvents(false);
          this.send(id, { type: 'capture', lang: this.state().lang }); win.show();
        }
      });
    } finally {
      this.capturePending = null;
      for (const win of this.overlays.values()) { win.hide(); win.setIgnoreMouseEvents(true); win.setFocusable(false); }
    }
  }
  captureReply(sender: number, raw: unknown): void {
    const map = this.maps.find(m => this.overlays.get(m.id)?.webContents.id === sender);
    if (!map || !this.capturePending) return;
    if (raw === null) { this.capturePending.reject(new Error('cancelled')); return; }
    if (!raw || typeof raw !== 'object') return;
    const r = raw as Record<string, unknown>;
    if (![r.x, r.y, r.w, r.h].every(n => typeof n === 'number' && Number.isFinite(n))) return;
    const { x, y, w, h } = r as { x: number; y: number; w: number; h: number };
    if (w < 3 || h < 3 || x < 0 || y < 0 || x + w > map.dip.width + 1 || y + h > map.dip.height + 1) return;
    this.capturePending.resolve({ display: map, rect: { x: Math.round(map.phys.x + x * map.scale),
      y: Math.round(map.phys.y + y * map.scale), w: Math.round(w * map.scale), h: Math.round(h * map.scale) } });
  }
  destroy(): void { for (const win of this.overlays.values()) win.destroy(); this.overlays.clear(); }
}
