import type { BuiltinProfile } from './teammate/settings';
import { ALL_PINGS, DEFAULT_WHEEL, isPingId, type PingId } from './pings';

export type InputSource = 'none' | 'selection' | 'clipboard' | 'manual' | 'screenshot' | 'previous';
export type ActionKind = 'shortcut' | 'openApp' | 'openPath' | 'openUrl' | 'readClipboard' | 'writeClipboard'
  | 'pasteText' | 'screenshot' | 'ai' | 'script' | 'delay' | 'switchWheel' | 'workflow';
export const ACTION_KINDS: readonly ActionKind[] = ['shortcut', 'openApp', 'openPath', 'openUrl', 'readClipboard',
  'writeClipboard', 'pasteText', 'screenshot', 'ai', 'script', 'delay', 'switchWheel', 'workflow'];
export const INPUT_SOURCES: readonly InputSource[] = ['none', 'selection', 'clipboard', 'manual', 'screenshot', 'previous'];
export interface ActionDefinition {
  id: string;
  name: string;
  nameEn: string;
  kind: ActionKind;
  input: InputSource;
  value: string;
  windows: string;
  mac: string;
  profileId: string;
  timeoutS: number;
  output: 'card' | 'copy' | 'paste';
}
export interface WheelProfile { id: string; name: string; nameEn: string; slots: (string | null)[]; effects: PingId[] }
export interface WorkflowStep { id: string; actionId: string; input: InputSource }
export interface WorkflowDefinition { id: string; name: string; steps: WorkflowStep[] }
export interface WorkbenchSettings {
  version: 1;
  activeWheelId: string;
  wheels: WheelProfile[];
  actions: ActionDefinition[];
  workflows: WorkflowDefinition[];
  profiles: BuiltinProfile[];
  defaultProfileId: string;
}
export interface ActionValue { text?: string; image?: { mime: 'image/jpeg'; data: string } }
export interface RunState {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'input' | 'completed' | 'cancelled' | 'failed';
  step: number;
  total: number;
  text: string;
  error: string;
  image?: string;
  inputTokens: number;
  outputTokens: number;
}
export const idleRun = (): RunState => ({ id: '', name: '', status: 'idle', step: 0, total: 0,
  text: '', error: '', inputTokens: 0, outputTokens: 0 });
export const newAction = (id: string, kind: ActionKind): ActionDefinition => ({ id, name: '', nameEn: '', kind,
  input: kind === 'ai' ? 'selection' : kind === 'pasteText' || kind === 'script' ? 'clipboard' : 'none',
  value: '', windows: '', mac: '', profileId: '', timeoutS: kind === 'ai' ? 120 : 30, output: 'card' });

export function defaultWorkbench(): WorkbenchSettings {
  const action = (id: string, name: string, nameEn: string, kind: ActionKind, extra: Partial<ActionDefinition> = {}): ActionDefinition =>
    ({ ...newAction(id, kind), name, nameEn, ...extra });
  const actions = [
    ...[['copy', '复制', 'Copy', 'C'], ['paste', '粘贴', 'Paste', 'V'], ['selectAll', '全选', 'Select all', 'A'],
      ['undo', '撤销', 'Undo', 'Z']].map(([id, zh, en, key]) => action(id, zh, en, 'shortcut', { value: `Primary+${key}` })),
    action('capture', '区域截图', 'Capture region', 'screenshot', { output: 'copy' }),
    action('downloads', '下载文件夹', 'Downloads', 'openPath', { value: '$DOWNLOADS' }),
    action('plainPaste', '纯文本粘贴', 'Paste plain text', 'pasteText', { input: 'clipboard' }),
    action('toAI', 'AI 助手', 'AI assistant', 'switchWheel', { value: 'ai' }),
    ...[
      ['translateZh', '翻译成中文', 'Translate to Chinese', 'Translate the input into natural Simplified Chinese. Return only the translation.'],
      ['translateEn', '翻译成英文', 'Translate to English', 'Translate the input into natural English. Return only the translation.'],
      ['polish', '润色', 'Polish writing', 'Polish the input, preserving its language and meaning. Return only the revised text.'],
      ['summarize', '摘要', 'Summarize', 'Summarize the input concisely, using the same language as the input.'],
      ['email', '改写成邮件', 'Draft email', 'Rewrite the input as a clear professional email in its original language.'],
      ['extract', '提取要点', 'Extract key points', 'Extract key points as a concise list, using the language of the input.'],
    ].map(([id, zh, en, value]) => action(id, zh, en, 'ai', { value })),
    action('vision', '截图问答', 'Ask about screenshot', 'ai', { input: 'screenshot', value: 'Explain the selected screenshot clearly. Use Simplified Chinese.' }),
    action('toTools', '常用工具', 'Everyday tools', 'switchWheel', { value: 'tools' }),
  ];
  return { version: 1, activeWheelId: 'tools', actions, workflows: [], profiles: [], defaultProfileId: '', wheels: [
    { id: 'tools', name: '常用工具', nameEn: 'Everyday tools', slots: actions.slice(0, 8).map(a => a.id), effects: [...DEFAULT_WHEEL] },
    { id: 'ai', name: 'AI 助手', nameEn: 'AI assistant', slots: actions.slice(8).map(a => a.id), effects: [...DEFAULT_WHEEL] },
  ] };
}
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown, max = 20000): string => typeof x === 'string' ? x.slice(0, max) : '';
// Never execute a silently truncated program. Oversized scripts are cleared and fail preflight.
const scriptSource = (x: unknown): string => typeof x === 'string' && x.length <= 20000 ? x : '';
const idOf = (x: unknown): string => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(x) ? x : '';
const list = (x: unknown): unknown[] => Array.isArray(x) ? x.slice(0, 200) : [];
const unique = <T extends { id: string }>(items: T[]): T[] => items.filter((a, i) => a.id && items.findIndex(b => b.id === a.id) === i);
export const inputOf = (x: unknown): InputSource => INPUT_SOURCES.includes(x as InputSource) ? x as InputSource : 'none';

/** Older WheelDesk settings gain the original effects without changing their action bindings. */
export function normalizeEffects(raw: unknown): PingId[] {
  const source = Array.isArray(raw) ? raw : [];
  const effects: PingId[] = [];
  for (let i = 0; i < 8; i++) {
    const desired = source[i];
    const fallback = [...DEFAULT_WHEEL, ...ALL_PINGS.map(p => p.id)].find(id => !effects.includes(id)) ?? 'generic';
    effects.push(isPingId(desired) && !effects.includes(desired) ? desired : fallback);
  }
  return effects;
}

/** Dragging a slot moves its effect and binding together; replacing artwork preserves that slot's action. */
export function setWheelEffects(wheel: WheelProfile, effects: readonly string[]): WheelProfile {
  const next = normalizeEffects(effects);
  return { ...wheel, effects: next, slots: next.map((id, i) => {
    const from = wheel.effects.indexOf(id);
    return wheel.slots[from >= 0 ? from : i];
  }) };
}

/** Rebuilds persisted and IPC configuration without accepting arbitrary executable fields. */
export function normalizeWorkbench(raw: unknown): WorkbenchSettings {
  if (!obj(raw)) return defaultWorkbench();
  const actions = unique(list(raw.actions).flatMap(v => {
    if (!obj(v) || !ACTION_KINDS.includes(v.kind as ActionKind) || !idOf(v.id)) return [];
    return [{ id: idOf(v.id), name: str(v.name, 80), nameEn: str(v.nameEn, 80), kind: v.kind as ActionKind,
      input: inputOf(v.input), value: str(v.value),
      windows: v.kind === 'script' ? scriptSource(v.windows) : str(v.windows),
      mac: v.kind === 'script' ? scriptSource(v.mac) : str(v.mac),
      profileId: idOf(v.profileId), timeoutS: typeof v.timeoutS === 'number' && Number.isFinite(v.timeoutS)
        ? Math.min(1800, Math.max(1, Math.round(v.timeoutS))) : v.kind === 'ai' ? 120 : 30,
      output: v.output === 'copy' || v.output === 'paste' ? v.output : 'card' } satisfies ActionDefinition];
  }));
  const wheels = unique(list(raw.wheels).flatMap(v => {
    if (!obj(v) || !idOf(v.id)) return [];
    const slots = list(v.slots);
    return [{ id: idOf(v.id), name: str(v.name, 80), nameEn: str(v.nameEn, 80),
      effects: normalizeEffects(v.effects),
      slots: Array.from({ length: 8 }, (_, i) => actions.some(a => a.id === slots[i]) ? String(slots[i]) : null) }];
  }));
  if (!wheels.length) wheels.push({ id: 'tools', name: '常用工具', nameEn: 'Everyday tools', slots: Array(8).fill(null), effects: [...DEFAULT_WHEEL] });
  const workflows = unique(list(raw.workflows).flatMap(v => {
    if (!obj(v) || !idOf(v.id)) return [];
    return [{ id: idOf(v.id), name: str(v.name, 80), steps: list(v.steps).slice(0, 50).flatMap(s =>
      obj(s) && idOf(s.id) && idOf(s.actionId) ? [{ id: idOf(s.id), actionId: idOf(s.actionId), input: inputOf(s.input) }] : []) }];
  }));
  const profiles = unique(list(raw.profiles).slice(0, 20).flatMap(v => {
    if (!obj(v) || !idOf(v.id)) return [];
    return [{ id: idOf(v.id), name: str(v.name, 80), kind: 'builtin', provider: 'custom',
      protocol: v.protocol === 'anthropic' ? 'anthropic' : 'openai', baseUrl: str(v.baseUrl, 2048),
      model: str(v.model, 200), tagColor: 3, tagColorCustom: null } satisfies BuiltinProfile];
  }));
  return { version: 1, actions, wheels, workflows, profiles,
    activeWheelId: wheels.some(w => w.id === raw.activeWheelId) ? String(raw.activeWheelId) : wheels[0].id,
    defaultProfileId: profiles.some(p => p.id === raw.defaultProfileId) ? String(raw.defaultProfileId) : profiles[0]?.id ?? '' };
}

export type WorkflowIssue = { step: number; code: 'missing' | 'nested' | 'image' | 'previous' | 'empty' };
/** Rejects missing references, recursion and image-to-text connections before any step runs. */
export function validateWorkflow(flow: WorkflowDefinition, settings: WorkbenchSettings): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  if (!flow.steps.length) return [{ step: 0, code: 'empty' }];
  let image = false;
  flow.steps.forEach((step, i) => {
    const a = settings.actions.find(a => a.id === step.actionId);
    if (!a) { issues.push({ step: i, code: 'missing' }); return; }
    if (a.kind === 'workflow') issues.push({ step: i, code: 'nested' });
    if (i === 0 && step.input === 'previous') issues.push({ step: i, code: 'previous' });
    const incomingImage = step.input === 'screenshot' || (step.input === 'previous' && image);
    if (incomingImage && ['script', 'pasteText', 'openUrl', 'openPath', 'openApp'].includes(a.kind)) issues.push({ step: i, code: 'image' });
    image = a.kind === 'screenshot' || (incomingImage && ['writeClipboard', 'delay'].includes(a.kind));
  });
  return issues;
}

/** Portable shortcut syntax; Primary maps to Command on macOS and Control on Windows. */
export function parseShortcut(value: string, mac: boolean): { vk: number; mods: number } | null {
  const parts = value.split('+').map(s => s.trim().toLowerCase());
  const key = parts.pop() ?? '';
  let mods = 0;
  for (const p of parts) {
    const bit = ({ primary: mac ? 8 : 1, ctrl: 1, control: 1, alt: 2, option: 2, shift: 4, cmd: 8, command: 8, win: 8 })[p];
    if (!bit) return null;
    mods |= bit;
  }
  const special: Record<string, number> = { enter: 13, tab: 9, escape: 27, space: 32, backspace: 8,
    delete: 46, left: 37, up: 38, right: 39, down: 40, home: 36, end: 35, pageup: 33, pagedown: 34 };
  const vk = /^[a-z0-9]$/.test(key) ? key.toUpperCase().charCodeAt(0)
    : /^f([1-9]|1[0-2])$/.test(key) ? 111 + Number(key.slice(1)) : special[key];
  return vk ? { vk, mods } : null;
}
