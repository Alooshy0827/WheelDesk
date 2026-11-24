import { app, BrowserWindow, ClipboardItem, clipboard, dialog, ipcMain, Menu, nativeImage, safeStorage, screen, shell, systemPreferences, Tray } from 'electron';
import { join } from 'node:path';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { setTimeout as wait } from 'node:timers/promises';
import { SettingsStore } from './settingsStore';
import { clearChangedModelKeys, modelError, testModelConnection } from './workbench/models';
import { InputBridge } from './inputBridge';
import { configCommand, type HelperEvent } from '../shared/protocol';
import { deskError, deskText, resolveLang } from '../shared/i18n';
import { normalizeSettings, type Settings } from '../shared/settings';
import { exportWheelBundle, hasPreparedInstruction, importWheelBundle, normalizeWorkbench, parseShortcut, type ActionDefinition, type ActionValue, type InputSource, type RunTurn } from '../shared/actions';
import { DESK_CH, type DeskReply, type DeskState, type Point } from '../shared/ipc';
import { ContextClient } from './teammate/contextClient';
import { DeskCredentials } from './workbench/credentials';
import { createAdapter } from './teammate/providers';
import { ProviderError, type Part, type Turn } from './teammate/providers/types';
import { ActionRunner, type ExecutionContext, type RunTarget } from './workbench/runner';
import { runScript } from './workbench/scripts';
import { DesktopSurfaces, deskWindow, loadDesk } from './workbench/surfaces';
import { registerDeskScheme, serveDeskScheme } from './workbench/protocol';
import { isPingId } from '../shared/pings';
import { checkInputAccess, PermissionRecovery } from './workbench/permissionRecovery';
import { shouldShowRun } from './workbench/presentation';
import { actionProfile, applyPreparedInstruction, prepareInstruction } from './workbench/aiInstructions';

const mac = process.platform === 'darwin';
const platform = mac ? 'mac' : 'win';
registerDeskScheme();
app.setName('WheelDesk');
app.setPath('userData', process.env.WHEELDESK_DATA_DIR || join(app.getPath('appData'), 'WheelDesk'));
if (!app.requestSingleInstanceLock()) app.quit();
let settingsWindow: BrowserWindow | null = null;
let settingsReady: Promise<void> | null = null;
let resultWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let initialized = false;
let store: SettingsStore;
let bridge: InputBridge;
let permissionRecovery: PermissionRecovery | undefined;
let context: ContextClient;
let secrets: DeskCredentials;
let surfaces: DesktopSurfaces;
let runner: ActionRunner;
let target: RunTarget = { window: '', selection: '', x: 0, y: 0 };
let origin: Promise<RunTarget> | null = null;
let requestedInput: { resolve: (text: string) => void; reject: (error: Error) => void } | null = null;
let starting = false;
let preparation: AbortController | null = null;
let cardReady: Promise<void> | null = null;
let aiSession: { profileId: string; system: string; turns: Turn[]; timeoutS: number } | null = null;
let followUpController: AbortController | null = null;
const helperPath = (name: string) => app.isPackaged ? mac ? join(process.resourcesPath, '../Helpers', name) : join(process.resourcesPath, name + '.exe')
  : join(app.getAppPath(), 'native/hook-helper/build', name + (mac ? '' : '.exe'));
const language = () => resolveLang(store.get().language, app.getLocale());
const t = () => deskText(language());
const label = (a: { name: string; nameEn?: string }) => language() === 'en' ? a.nameEn || a.name : a.name;
function state(): DeskState {
  const baseRun = requestedInput ? { ...runner.state, status: 'input' as const } : runner.state;
  return { settings: store.get(), lang: language(), platform, helper: bridge.status,
    run: { ...baseRun, canFollowUp: Boolean(aiSession && !runner.busy && !followUpController) },
    ...secrets.status() };
}
function broadcast(): void {
  for (const w of [settingsWindow, resultWindow]) if (w && !w.isDestroyed()) w.webContents.send(DESK_CH.state, state());
}
async function showSettings(): Promise<void> {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    settingsWindow = deskWindow({ title: 'WheelDesk', width: 1020, height: 700, minWidth: 900, minHeight: 540,
      ...(mac ? { backgroundColor: '#010a13',
        titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 24, y: 18 } }
        : { backgroundColor: '#010a13', titleBarStyle: 'hidden',
          titleBarOverlay: { color: '#061018', symbolColor: '#c8aa6e', height: 48 } }),
    });
    settingsWindow.on('close', event => { if (!quitting) { event.preventDefault(); settingsWindow?.hide(); } });
    settingsReady = loadDesk(settingsWindow, 'settings');
  }
  await settingsReady;
  settingsWindow.show(); settingsWindow.focus(); broadcast();
}
async function showResult(focus = false, stillNeeded: () => boolean = () => true): Promise<void> {
  if (!resultWindow || resultWindow.isDestroyed()) {
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    resultWindow = deskWindow({ title: 'WheelDesk', width: 440, height: 500, minWidth: 360, minHeight: 300,
      x: d.workArea.x + d.workArea.width - 464, y: d.workArea.y + 32, alwaysOnTop: true,
      backgroundColor: '#010a13', skipTaskbar: true, focusable: focus });
    resultWindow.on('close', event => {
      if (!quitting) { event.preventDefault(); if (requestedInput) runner.cancel(); resultWindow?.hide(); }
    });
    cardReady = loadDesk(resultWindow, 'result');
  }
  await cardReady;
  if (!stillNeeded()) return;
  resultWindow.setFocusable(focus);
  if (focus) resultWindow.show(); else resultWindow.showInactive();
  broadcast();
}
function configure(): void {
  const settings = store.get();
  // The native gesture channel stays compatible; only its primary wheel is used in WheelDesk.
  bridge.send({ ...configCommand({ ...settings, emoteTrigger: 'off', clickPing: false,
    features: { ...settings.features, emotes: false, rooms: false, teammate: false } }, settings.enabledOnStart), openOnPress: true });
  if (app.isPackaged && app.getLoginItemSettings().openAtLogin !== settings.launchAtStartup)
    app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup, args: ['--hidden'] });
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: 'WheelDesk', enabled: false },
    ...settings.workbench.wheels.map(w => ({ label: label(w), type: 'radio' as const,
      checked: w.id === settings.workbench.activeWheelId, click: () => switchWheel(w.id) })),
    { type: 'separator' }, { label: t().enabled, type: 'checkbox', checked: settings.enabledOnStart,
      click: () => store.update({ enabledOnStart: !settings.enabledOnStart }) },
    { label: t().general, click: () => void showSettings() },
    { label: t().close, click: () => app.quit() },
  ]));
  broadcast();
}
function switchWheel(id: string): void {
  const wb = store.get().workbench;
  if (!wb.wheels.some(w => w.id === id)) throw new Error('missing');
  store.update({ workbench: { ...wb, activeWheelId: id } });
}
async function snapshot(point: Point): Promise<RunTarget> {
  const front = await context.foreground(AbortSignal.timeout(3000));
  return { window: front.window, selection: '', x: point.x, y: point.y };
}
async function selection(at: RunTarget, signal: AbortSignal): Promise<string> {
  if (!at.window) return '';
  const front = await context.front(signal);
  if (front.window !== at.window) throw new Error('target');
  const read = await context.read({ spots: [{ x: at.x, y: at.y }], radius: 0, marks: false, text: true,
    file: false, boxes: false, fields: false, dir: app.getPath('temp') }, signal);
  at.selection = read.text?.selection ?? '';
  return at.selection;
}
async function manualInput(signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  try {
    return await new Promise<string>((resolve, reject) => {
      const abort = () => { requestedInput = null; resultWindow?.hide(); reject(new Error('cancelled')); };
      signal.addEventListener('abort', abort, { once: true });
      requestedInput = { resolve: value => { signal.removeEventListener('abort', abort); resolve(value); },
        reject: error => { signal.removeEventListener('abort', abort); reject(error); } };
      void showResult(true, () => Boolean(requestedInput) && !signal.aborted).catch(reject);
    });
  } finally {
    requestedInput = null;
    resultWindow?.hide();
    if (mac) app.hide();
    await wait(180);
    broadcast();
  }
}
async function capture(signal: AbortSignal): Promise<ActionValue> {
  resultWindow?.hide();
  const chosen = await surfaces.selectRegion(signal);
  if (mac) app.hide();
  await wait(120, undefined, { signal });
  const dir = await mkdtemp(join(tmpdir(), 'wheeldesk-capture-'));
  try {
    const p = chosen.display.phys;
    const captured = await context.capture({ display: { x: p.x, y: p.y, w: p.width, h: p.height },
      area: chosen.rect, spots: [], dir }, signal);
    return { image: { mime: 'image/jpeg', data: (await readFile(captured.overviewPath)).toString('base64') } };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
async function input(source: InputSource, previous: ActionValue, at: RunTarget, signal: AbortSignal): Promise<ActionValue> {
  switch (source) {
    case 'previous': return previous;
    case 'clipboard': return { text: await clipboard.readText() };
    case 'manual': return { text: await manualInput(signal) };
    case 'screenshot': return capture(signal);
    case 'selection': {
      const value = await selection(at, signal);
      return { text: value || await manualInput(signal) };
    }
    default: return {};
  }
}
async function copyValue(value: ActionValue): Promise<void> {
  if (value.image) await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(nativeImage.createFromDataURL(`data:${value.image.mime};base64,${value.image.data}`).toPNG())], { type: 'image/png' }) })]);
  else await clipboard.writeText(value.text ?? '');
}
async function fill(text: string, at: RunTarget, signal: AbortSignal): Promise<void> {
  if (!at.window) throw new Error('target');
  const reply = await context.paste({ window: at.window, text, click: null, field: '',
    mode: at.selection ? 'replace' : 'insert', asked: at.selection }, signal);
  if (reply.result !== 'ok') {
    const errors: Record<string, string> = { window: 'target', selection: 'noSelection', busy: 'busyClipboard' };
    throw new Error(errors[reply.result] ?? reply.result);
  }
  if (!reply.restored) throw new Error('restore');
  at.selection = '';
}
async function instructionFor(action: ActionDefinition, ctx: Pick<ExecutionContext, 'settings' | 'signal' | 'usage'>, regenerate = false): Promise<string> {
  if (!action.aiCustom) return action.value;
  if (!regenerate && hasPreparedInstruction(action.aiCustom)) return action.aiCustom.instruction;
  if (preparation) throw new Error('busy');
  const controller = new AbortController();
  preparation = controller;
  const signal = AbortSignal.any([ctx.signal, controller.signal]);
  try {
    const profile = actionProfile(action, ctx.settings);
    const prepared = await prepareInstruction(action, profile, secrets.key(profile.id) ?? '', signal, regenerate, ctx.usage);
    signal.throwIfAborted();
    const next = applyPreparedInstruction(store.get().workbench, ctx.settings, action, prepared);
    const problems = store.problems.length;
    store.update({ workbench: next });
    await store.flush();
    if (store.problems.length > problems) throw new Error('saveFailed');
    // Repeated references in this workflow share the successful preparation as well.
    action.aiCustom = prepared;
    return prepared.instruction;
  } finally { if (preparation === controller) preparation = null; }
}
async function execute(action: ActionDefinition, value: ActionValue, ctx: ExecutionContext): Promise<ActionValue> {
  ctx.signal.throwIfAborted();
  const text = value.text ?? action.value;
  let output: ActionValue = value;
  switch (action.kind) {
    case 'shortcut': {
      const key = parseShortcut(action.value, mac);
      if (!key) throw new Error('invalidShortcut');
      const result = await context.shortcut(ctx.target.window, key.vk, key.mods, ctx.signal);
      if (result !== 'ok') throw new Error(result === 'window' ? 'target' : result);
      break;
    }
    case 'openPath': {
      const path = (mac ? action.mac : action.windows) || text;
      if (!path) throw new Error('path');
      const error = await shell.openPath(path === '$DOWNLOADS' ? app.getPath('downloads') : path);
      if (error) throw new Error(error);
      break;
    }
    case 'openUrl': {
      let url: URL;
      try { url = new URL(text); } catch { throw new Error('invalidUrl'); }
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalidUrl');
      await shell.openExternal(url.toString()); break;
    }
    case 'readClipboard': output = { text: await clipboard.readText() }; break;
    case 'writeClipboard': output = value.text === undefined && !value.image ? { text: action.value } : value; await copyValue(output); break;
    case 'pasteText': await fill(text, ctx.target, ctx.signal); break;
    case 'screenshot': output = await capture(ctx.signal); if (action.output === 'copy') await copyValue(output); break;
    case 'switchWheel': switchWheel(action.value); break;
    case 'delay': {
      const ms = Number(action.value);
      if (!Number.isFinite(ms) || ms < 0 || ms > 600000) throw new Error('timeout');
      await wait(ms, undefined, { signal: ctx.signal }); break;
    }
    case 'script': output = { text: await runScript(mac ? action.mac : action.windows, value.text ?? '', mac, ctx.signal) }; break;
    case 'ai': {
      const wb = ctx.settings;
      const profile = actionProfile(action, wb);
      const prompt = await instructionFor(action, ctx);
      const key = secrets.key(profile.id) ?? '';
      const parts: Part[] = [];
      const instruction = prompt.includes('{{input}}') ? prompt.split('{{input}}').join(value.text ?? '') : prompt;
      if (value.text && !prompt.includes('{{input}}')) parts.push({ text: value.text });
      if (value.image) parts.push({ image: { mime: value.image.mime, data: Buffer.from(value.image.data, 'base64') } });
      if (!parts.length) parts.push({ text: instruction });
      try {
        const answer = await createAdapter(profile, key).turn({ system: instruction, turns: [{ role: 'user', parts }],
          tools: [], model: profile.model }, { accepted: () => undefined, text: ctx.delta,
          usage: u => ctx.usage(u.input, u.output) }, ctx.signal);
        output = { text: answer.text };
        aiSession = {
          profileId: profile.id,
          system: instruction,
          turns: [{ role: 'user', parts }, { role: 'assistant', text: answer.text, calls: [] }],
          timeoutS: action.timeoutS,
        };
      } catch (error) {
        if (ctx.signal.aborted) throw new Error(ctx.signal.reason?.name === 'TimeoutError' ? 'timeout' : 'cancelled');
        if (error instanceof ProviderError) throw new Error(['auth', 'rate', 'network', 'images'].includes(error.kind) ? error.kind : 'provider');
        throw new Error('network');
      }
      break;
    }
    case 'workflow': throw new Error('workflowInvalid');
  }
  ctx.signal.throwIfAborted();
  if (action.kind === 'ai' || action.kind === 'script') {
    if (action.output === 'copy') await copyValue(output);
    else if (action.output === 'paste') await fill(output.text ?? '', ctx.target, ctx.signal);
  }
  return output;
}
async function start(id: string, point?: Point, prepared?: Promise<RunTarget>): Promise<void> {
  if (runner.busy || followUpController || starting || preparation) throw new Error('busy');
  aiSession = null;
  starting = true;
  try {
    if (!point) {
      const p = screen.getCursorScreenPoint();
      point = mac ? p : screen.dipToScreenPoint(p);
    }
    // Actions without a target window still work if Accessibility has not been granted.
    target = await (prepared ?? snapshot(point)).catch(() => ({ window: '', selection: '', x: point?.x ?? 0, y: point?.y ?? 0 }));
    const wb = structuredClone(store.get().workbench);
    for (const a of wb.actions) a.name = label(a);
    await runner.run(id, wb, target);
  } finally { starting = false; }
}
function presentError(error: unknown): void {
  const message = error instanceof Error ? error.message : 'failed';
  if (runner.busy || starting) {
    if (requestedInput) void showResult(true, () => Boolean(requestedInput));
    else if (shouldShowRun(runner.state, runner.presentation))
      void showResult(false, () => !requestedInput && shouldShowRun(runner.state, runner.presentation));
    return;
  }
  runner.state = { ...runner.state, status: 'failed', error: deskError(message, language()) };
  void showResult();
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
async function handle(sender: Electron.WebContents, raw: unknown): Promise<DeskReply> {
  const isSettings = settingsWindow?.webContents.id === sender.id;
  const isResult = resultWindow?.webContents.id === sender.id;
  const isOverlay = surfaces.role(sender.id);
  if ((!isSettings && !isResult && !isOverlay) || !record(raw) || typeof raw.type !== 'string') return { ok: false };
  if (raw.type === 'state') return { ok: true, state: state() };
  if (raw.type === 'capture' && isOverlay) { surfaces.captureReply(sender.id, raw.rect); return { ok: true }; }
  if (raw.type === 'overlayIdle' && isOverlay && typeof raw.idle === 'boolean') {
    surfaces.idle(sender.id, raw.idle); return { ok: true };
  }
  if (isOverlay) return { ok: false };
  switch (raw.type) {
    case 'previewEffect': {
      if (!isSettings || !isPingId(raw.effect)) return { ok: false };
      await surfaces.preview(raw.effect); return { ok: true };
    }
    case 'save': {
      if (!isSettings || !record(raw.settings)) return { ok: false };
      const s = raw.settings;
      const normalized = normalizeSettings({ ...store.get(), workbench: normalizeWorkbench(s.workbench),
        trigger: s.trigger, dragThresholdPx: s.dragThresholdPx, language: s.language,
        enabledOnStart: s.enabledOnStart, launchAtStartup: s.launchAtStartup,
        wheelSizePx: s.wheelSizePx, pingSizePx: s.pingSizePx, pingDurationS: s.pingDurationS,
        volume: s.volume, muted: s.muted, tickSound: s.tickSound }, platform);
      const problems = store.problems.length;
      await clearChangedModelKeys(store.get().workbench.profiles, normalized.workbench.profiles, secrets);
      // An unrelated autosave must keep a newer selection made from the tray or a wheel action.
      if (raw.preserveActiveWheel === true) {
        const currentId = store.get().workbench.activeWheelId;
        if (normalized.workbench.wheels.some(w => w.id === currentId)) normalized.workbench.activeWheelId = currentId;
      }
      store.update(normalized); await store.flush();
      if (store.problems.length > problems) throw new Error('saveFailed');
      return { ok: true, state: state() };
    }
    case 'run': {
      if (!isSettings || typeof raw.id !== 'string') return { ok: false };
      if (runner.busy || starting || preparation) throw new Error('busy');
      const id = raw.id;
      starting = true;
      setTimeout(() => { starting = false; void start(id).catch(presentError); }, 3000);
      return { ok: true };
    }
    case 'prepareAI': {
      if (!isSettings || typeof raw.id !== 'string' || typeof raw.regenerate !== 'boolean') return { ok: false };
      if (runner.busy || starting || preparation) throw new Error('busy');
      const snapshot = structuredClone(store.get().workbench);
      const action = snapshot.actions.find(a => a.id === raw.id);
      if (!action || action.kind !== 'ai' || !action.aiCustom) throw new Error('missing');
      await instructionFor(action, { settings: snapshot, signal: AbortSignal.timeout(action.timeoutS * 1000), usage: () => undefined }, raw.regenerate);
      return { ok: true, state: state() };
    }
    case 'cancelPrepareAI': if (!isSettings) return { ok: false }; preparation?.abort(); return { ok: true };
    case 'cancel': runner.cancel(); followUpController?.abort(); return { ok: true };
    case 'focusResult': {
      if (!isResult || !resultWindow || resultWindow.isDestroyed()) return { ok: false };
      resultWindow.setFocusable(true);
      resultWindow.focus();
      return { ok: true };
    }
    case 'copyText': {
      if (!isResult || typeof raw.text !== 'string' || raw.text.length > 200_000) return { ok: false };
      await clipboard.writeText(raw.text);
      return { ok: true };
    }
    case 'followUp': {
      if (!isResult || typeof raw.text !== 'string') return { ok: false };
      const question = raw.text.trim().slice(0, 20000);
      if (!question) throw new Error('emptyInput');
      if (runner.busy || followUpController || starting || preparation) throw new Error('busy');
      if (!aiSession) throw new Error('noSession');
      const session = aiSession;
      const wb = store.get().workbench;
      const profile = wb.profiles.find(p => p.id === session.profileId)
        ?? wb.profiles.find(p => p.id === wb.defaultProfileId)
        ?? wb.profiles[0];
      if (!profile) throw new Error('modelMissing');
      const key = secrets.key(profile.id) ?? '';
      const priorHistory: RunTurn[] = [...(runner.state.history ?? [])];
      if (runner.state.text) priorHistory.push({ role: 'assistant', text: runner.state.text });
      priorHistory.push({ role: 'user', text: question });
      const nextTurns: Turn[] = [...session.turns, { role: 'user', parts: [{ text: question }] }];
      const controller = new AbortController();
      followUpController = controller;
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(session.timeoutS * 1000)]);
      runner.state = { ...runner.state, status: 'running', text: '', error: '', history: priorHistory };
      broadcast();
      try {
        const answer = await createAdapter(profile, key).turn(
          { system: session.system, turns: nextTurns, tools: [], model: profile.model },
          {
            accepted: () => undefined,
            text: delta => {
              if (!signal.aborted) {
                runner.state = { ...runner.state, text: runner.state.text + delta };
                broadcast();
              }
            },
            usage: u => {
              runner.state = {
                ...runner.state,
                inputTokens: runner.state.inputTokens + u.input,
                outputTokens: runner.state.outputTokens + u.output,
              };
              broadcast();
            },
          },
          signal,
        );
        signal.throwIfAborted();
        session.turns = [...nextTurns, { role: 'assistant', text: answer.text, calls: [] }];
        runner.state = { ...runner.state, status: 'completed', text: answer.text, error: '' };
        broadcast();
        return { ok: true };
      } catch (error) {
        const cancelled = controller.signal.aborted;
        const code = cancelled
          ? ''
          : signal.aborted
            ? 'timeout'
            : error instanceof ProviderError && ['auth', 'rate', 'network', 'images'].includes(error.kind)
              ? error.kind
              : error instanceof ProviderError
                ? 'provider'
                : 'network';
        runner.state = {
          ...runner.state,
          status: cancelled ? 'cancelled' : 'failed',
          error: code ? deskError(code, language()) : '',
        };
        broadcast();
        return { ok: false, error: code ? deskError(code, language()) : undefined };
      } finally {
        if (followUpController === controller) followUpController = null;
        broadcast();
      }
    }
    case 'exportWheel': {
      if (!isSettings || typeof raw.wheelId !== 'string') return { ok: false };
      const bundle = exportWheelBundle(store.get().workbench, raw.wheelId);
      if (!bundle) throw new Error('missing');
      const safeName = (label(bundle.wheel) || 'wheel').replace(/[^\w\u4e00-\u9fff-]+/g, '_').slice(0, 48) || 'wheel';
      const picked = settingsWindow && !settingsWindow.isDestroyed()
        ? await dialog.showSaveDialog(settingsWindow, {
          defaultPath: `${safeName}.wheeldesk.json`,
          filters: [{ name: 'WheelDesk Preset', extensions: ['json'] }],
        })
        : await dialog.showSaveDialog({
          defaultPath: `${safeName}.wheeldesk.json`,
          filters: [{ name: 'WheelDesk Preset', extensions: ['json'] }],
        });
      if (picked.canceled || !picked.filePath) return { ok: true, cancelled: true };
      await writeFile(picked.filePath, JSON.stringify(bundle, null, 2) + '\n', 'utf8');
      return { ok: true };
    }
    case 'importWheel': {
      if (!isSettings) return { ok: false };
      const picked = settingsWindow && !settingsWindow.isDestroyed()
        ? await dialog.showOpenDialog(settingsWindow, {
          properties: ['openFile'],
          filters: [{ name: 'WheelDesk Preset', extensions: ['json'] }],
        })
        : await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [{ name: 'WheelDesk Preset', extensions: ['json'] }],
        });
      if (picked.canceled || !picked.filePaths[0]) return { ok: true, cancelled: true };
      const filePath = picked.filePaths[0];
      const info = await stat(filePath);
      if (info.size > 2 * 1024 * 1024) throw new Error('invalidPreset');
      let parsed: unknown;
      try { parsed = JSON.parse(await readFile(filePath, 'utf8')); }
      catch { throw new Error('invalidPreset'); }
      const imported = importWheelBundle(store.get().workbench, parsed);
      if (!imported) throw new Error('invalidPreset');
      const problems = store.problems.length;
      store.update({ workbench: imported.settings });
      await store.flush();
      if (store.problems.length > problems) throw new Error('saveFailed');
      return { ok: true, wheelId: imported.wheelId, state: state() };
    }
    case 'key': {
      if (!isSettings || typeof raw.id !== 'string' || typeof raw.key !== 'string' || raw.key.length > 8192
        || !store.get().workbench.profiles.some(p => p.id === raw.id)) return { ok: false };
      await secrets.setKey(raw.id, raw.key); broadcast(); return { ok: true };
    }
    case 'check':
    case 'testModel': {
      if (!isSettings || typeof raw.id !== 'string' || (raw.key !== undefined &&
        (typeof raw.key !== 'string' || raw.key.length > 8192))) return { ok: false };
      const p = store.get().workbench.profiles.find(p => p.id === raw.id);
      if (!p) throw new Error('modelMissing');
      const key = typeof raw.key === 'string' && raw.key.trim() ? raw.key.trim() : secrets.key(p.id) ?? '';
      if (raw.type === 'testModel') return { ok: true, latencyMs: await testModelConnection(p, key) };
      const signal = AbortSignal.timeout(15000);
      try { return { ok: true, models: await createAdapter(p, key).listModels(signal) }; }
      catch (e) { throw new Error(modelError(e, signal)); }
    }
    case 'input': {
      if (!isResult || !requestedInput) return { ok: false };
      const text = raw.clipboard === true ? await clipboard.readText() : typeof raw.text === 'string' ? raw.text.slice(0, 20000) : '';
      if (!text.trim()) throw new Error('emptyInput');
      requestedInput.resolve(text); return { ok: true };
    }
    case 'copy': if (runner.state.image) await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(nativeImage.createFromDataURL(runner.state.image).toPNG())], { type: 'image/png' }) })]);
      else await clipboard.writeText(runner.state.text); return { ok: true };
    case 'paste': {
      if (!isResult || runner.busy || followUpController) return { ok: false };
      // If the user focused the card to type a follow-up, return focus to the target app before filling.
      if (resultWindow?.isFocused()) {
        resultWindow.hide();
        if (mac) app.hide();
        await wait(140);
      }
      await fill(runner.state.text, target, AbortSignal.timeout(8000)); return { ok: true };
    }
    case 'close': if (isResult) { if (requestedInput || followUpController) { runner.cancel(); followUpController?.abort(); } resultWindow?.hide(); } return { ok: true };
    case 'retry': if (isSettings) bridge.retry(); return { ok: true };
    case 'accessibility': if (isSettings && mac) {
      systemPreferences.isTrustedAccessibilityClient(true);
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    } return { ok: true };
    case 'screenPermission': if (isSettings && mac)
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
      return { ok: true };
    case 'data': if (isSettings) await shell.openPath(store.dir); return { ok: true };
    default: return { ok: false };
  }
}
app.on('second-instance', () => { if (initialized) void showSettings(); });
app.on('activate', () => { if (initialized) void showSettings(); });
app.on('window-all-closed', () => undefined);
app.on('before-quit', event => {
  if (quitting || !bridge) return;
  event.preventDefault(); quitting = true;
  permissionRecovery?.dispose();
  runner.cancel(); followUpController?.abort(); preparation?.abort(); surfaces.destroy();
  void Promise.all([bridge.stop(), context.stop(), store.flush()]).finally(() => app.quit());
});
void app.whenReady().then(async () => {
  serveDeskScheme(join(__dirname, '../renderer'));
  store = new SettingsStore(app.getPath('userData'), 100, platform);
  store.load();
  bridge = new InputBridge({ command: helperPath('hook-helper') });
  context = new ContextClient({ command: helperPath('context-helper') });
  secrets = new DeskCredentials(join(store.dir, 'secrets.enc'), () => safeStorage);
  runner = new ActionRunner({ input, execute, publish: run => {
    if (run.error) runner.state.error = deskError(run.error, language());
    broadcast();
    if (!requestedInput) {
      const needed = () => runner.state.id === run.id && !requestedInput && shouldShowRun(runner.state, runner.presentation);
      if (needed()) void showResult(false, needed);
      else resultWindow?.hide();
    }
  } });
  surfaces = new DesktopSurfaces(mac, state, point => { origin = snapshot(point); void origin.catch(() => undefined); },
    (id, point) => { const prepared = origin; origin = null; void start(id, point, prepared ?? undefined).catch(presentError); });
  surfaces.refresh();
  const refresh = () => { surfaces.cancel(true); surfaces.refresh(); };
  screen.on('display-added', refresh); screen.on('display-removed', refresh); screen.on('display-metrics-changed', refresh);
  bridge.on('event', (event: HelperEvent) => {
    if (event.type === 'toggled') store.update({ enabledOnStart: event.enabled });
    else surfaces.handle(event);
  });
  bridge.on('status', () => { if (bridge.status !== 'running') surfaces.cancel(); broadcast(); });
  const trayAsset = mac ? 'trayCompassTemplate.png' : 'trayTemplate.png';
  const icon = nativeImage.createFromPath(app.isPackaged ? join(process.resourcesPath, trayAsset)
    : join(app.getAppPath(), 'build/desk', trayAsset));
  icon.setTemplateImage(mac);
  tray = new Tray(icon); tray.setToolTip('WheelDesk'); tray.on('double-click', () => void showSettings());
  ipcMain.handle(DESK_CH.invoke, async (event, raw: unknown) => {
    try { return await handle(event.sender, raw); }
    catch (e) { return { ok: false, error: deskError(e instanceof Error ? e.message : 'failed', language()) }; }
  });
  store.on('change', configure);
  initialized = true;
  configure(); bridge.start();
  if (mac) permissionRecovery = new PermissionRecovery(() => bridge.status,
    () => checkInputAccess(helperPath('hook-helper')), () => bridge.retry());
  if (!process.argv.includes('--hidden')) await showSettings();
}).catch(error => { console.error('WheelDesk startup:', error instanceof Error ? error.message : 'failed'); app.quit(); });
