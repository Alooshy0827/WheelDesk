import type { BuiltinProfile } from './teammate/settings';
import { DESK_PROVIDERS } from './workbenchModels';
import { ALL_PINGS, DEFAULT_WHEEL, isPingId, type PingId } from './pings';
import { normalizeSlotCount, WHEEL_SLOT_LIMITS } from './geometry';

export type InputSource = 'none' | 'selection' | 'clipboard' | 'manual' | 'screenshot' | 'previous';
export type ActionKind = 'shortcut' | 'openPath' | 'openUrl' | 'readClipboard' | 'writeClipboard'
  | 'pasteText' | 'screenshot' | 'ai' | 'script' | 'delay' | 'switchWheel' | 'workflow';
export const ACTION_KINDS: readonly ActionKind[] = ['shortcut', 'openPath', 'openUrl', 'readClipboard',
  'writeClipboard', 'pasteText', 'screenshot', 'ai', 'script', 'delay', 'switchWheel', 'workflow'];
export const INPUT_SOURCES: readonly InputSource[] = ['none', 'selection', 'clipboard', 'manual', 'screenshot', 'previous'];
export interface AiCustomInstruction {
  description: string;
  /** The exact description this reusable instruction was prepared for. */
  source: string;
  instruction: string;
  feedback: string;
}
export const hasPreparedInstruction = (custom: AiCustomInstruction): boolean =>
  Boolean(custom.description.trim() && custom.instruction.trim() && custom.source === custom.description);
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
  aiCustom?: AiCustomInstruction;
  timeoutS: number;
  output: 'card' | 'copy' | 'paste';
}
/** Entries beyond slotCount are retained so shrinking a wheel never discards bindings. */
export interface WheelProfile { id: string; name: string; nameEn: string; slotCount: number; slots: (string | null)[]; effects: PingId[]; slotNames: string[] }
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

// Persisted action IDs cannot contain a colon, so a workflow and an action may share a raw ID.
export const workflowBindingId = (id: string): string => 'workflow:' + id;

// Workflow-only building blocks do not make sense as standalone wheel-slot triggers.
const WORKFLOW_ONLY_KINDS: readonly ActionKind[] = ['delay', 'readClipboard'];

export function wheelBindings(settings: WorkbenchSettings): ActionDefinition[] {
  return [...settings.actions.filter(a => a.kind !== 'workflow'), ...settings.workflows.map(flow => ({
    ...newAction(workflowBindingId(flow.id), 'workflow'), name: flow.name, value: flow.id,
  }))];
}

/** Choices suitable for binding directly to a wheel slot (excludes workflow-only blocks and self-switches, unless already bound). */
export function slotBindableActions(settings: WorkbenchSettings, wheelId: string, currentSlotId: string | null = null): ActionDefinition[] {
  return wheelBindings(settings).filter(action => {
    if (action.id === currentSlotId) return true;
    if (WORKFLOW_ONLY_KINDS.includes(action.kind)) return false;
    if (action.kind === 'switchWheel' && action.value === wheelId) return false;
    return true;
  });
}

export function usesActionInput(kind: ActionKind, inWorkflow = false): boolean {
  if (kind === 'screenshot' || kind === 'readClipboard' || kind === 'workflow') return false;
  // A workflow can pass its input through a shortcut, delay or preset switch to a later step.
  return inWorkflow || !['shortcut', 'delay', 'switchWheel'].includes(kind);
}

export function defaultWorkbench(): WorkbenchSettings {
  const action = (id: string, name: string, nameEn: string, kind: ActionKind, extra: Partial<ActionDefinition> = {}): ActionDefinition =>
    ({ ...newAction(id, kind), name, nameEn, ...extra });
  const actions = [
    action('capture', '区域截图', 'Capture region', 'screenshot', { output: 'copy' }),
    action('vision', '截图问答', 'Ask about screenshot', 'ai', { input: 'screenshot', value: 'Explain the selected screenshot clearly. Use Simplified Chinese.' }),
    action('ocr', '截图提取文字', 'Extract text (OCR)', 'ai', { input: 'screenshot', output: 'copy', value: 'Extract all readable text from the screenshot verbatim. Preserve line breaks and return only the extracted text.' }),
    action('plainPaste', '纯文本粘贴', 'Paste plain text', 'pasteText', { input: 'clipboard' }),
    action('translate', '中英互译', 'Translate ZH/EN', 'ai', { value: 'If the input is primarily Chinese, translate it into natural English; otherwise translate it into natural Simplified Chinese. Return only the translation.' }),
    action('polish', '润色', 'Polish writing', 'ai', { value: 'Polish the input, preserving its language and meaning. Return only the revised text.' }),
    action('downloads', '下载文件夹', 'Downloads', 'openPath', { value: '$DOWNLOADS' }),
    action('toAI', 'AI 助手', 'AI assistant', 'switchWheel', { value: 'ai' }),
    action('summarize', '总结要点', 'Summarize key points', 'ai', { value: 'Summarize the input concisely as clear key points, using the same language as the input.' }),
    action('explain', '解释代码 / 概念', 'Explain code / concept', 'ai', { value: 'Explain the input clearly and concisely, focusing on intent, behavior, and any potential issues. Use Simplified Chinese.' }),
    action('screenshotTranslate', '截图翻译', 'Translate screenshot', 'ai', { input: 'screenshot', value: 'Translate any text visible in the screenshot into natural Simplified Chinese. Return only the translation.' }),
    action('toTools', '常用工具', 'Everyday tools', 'switchWheel', { value: 'tools' }),
  ];
  return { version: 1, activeWheelId: 'tools', actions, workflows: [], profiles: [], defaultProfileId: '', wheels: [
    { id: 'tools', name: '常用工具', nameEn: 'Everyday tools', slotCount: 8,
      slots: ['capture', 'vision', 'ocr', 'plainPaste', 'translate', 'polish', 'downloads', 'toAI'],
      effects: [...DEFAULT_WHEEL], slotNames: Array(8).fill('') },
    { id: 'ai', name: 'AI 助手', nameEn: 'AI assistant', slotCount: 8,
      slots: ['translate', 'polish', 'summarize', 'explain', 'vision', 'ocr', 'screenshotTranslate', 'toTools'],
      effects: [...DEFAULT_WHEEL], slotNames: Array(8).fill('') },
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
export function normalizeEffects(raw: unknown, count = 8): PingId[] {
  const source = Array.isArray(raw) ? raw : [];
  const effects: PingId[] = [];
  for (let i = 0; i < normalizeSlotCount(count); i++) {
    const desired = source[i];
    const fallback = [...DEFAULT_WHEEL, ...ALL_PINGS.map(p => p.id)].find(id => !effects.includes(id)) ?? 'generic';
    effects.push(isPingId(desired) && !effects.includes(desired) ? desired : fallback);
  }
  return effects;
}

/** Only expand storage; a smaller wheel hides its remaining slots until expanded again. */
export function resizeWheel(wheel: WheelProfile, count: number): WheelProfile {
  const slotCount = normalizeSlotCount(count);
  const capacity = Math.max(slotCount, wheel.slots.length);
  return { ...wheel, slotCount, effects: normalizeEffects(wheel.effects, capacity),
    slotNames: Array.from({ length: capacity }, (_, i) => wheel.slotNames[i] ?? ''),
    slots: Array.from({ length: capacity }, (_, i) => wheel.slots[i] ?? null) };
}

/** Dragging moves effect, binding and name together; replacing artwork preserves the action and name. */
export function setWheelEffects(wheel: WheelProfile, effects: readonly string[]): WheelProfile {
  const next = normalizeEffects(effects, wheel.slotCount);
  const visibleEffects = wheel.effects.slice(0, wheel.slotCount);
  const visibleSlots = wheel.slots.slice(0, wheel.slotCount);
  const names: string[] = [];
  const origins = next.map(id => visibleEffects.indexOf(id));
  const used = new Set(origins.filter(i => i >= 0));
  const slots = next.map((_, i) => {
    let from = origins[i];
    if (from < 0) {
      // Reset can replace several effects at once. Reuse each displaced binding exactly once.
      from = !used.has(i) ? i : visibleSlots.findIndex((_, j) => !used.has(j));
      used.add(from);
    }
    names.push(wheel.slotNames[from] ?? '');
    return visibleSlots[from] ?? null;
  });
  // A newly chosen effect may have belonged to a hidden slot. Keep its function and repair only its artwork.
  return { ...wheel, effects: normalizeEffects([...next, ...wheel.effects.slice(wheel.slotCount)], wheel.effects.length),
    slots: [...slots, ...wheel.slots.slice(wheel.slotCount)], slotNames: [...names, ...wheel.slotNames.slice(wheel.slotCount)] };
}

/** Rebuilds persisted and IPC configuration without accepting arbitrary executable fields. */
export function normalizeWorkbench(raw: unknown): WorkbenchSettings {
  if (!obj(raw)) return defaultWorkbench();
  const actions = unique(list(raw.actions).flatMap(v => {
    if (!obj(v) || !idOf(v.id)) return [];
    // Keep the action ID: wheel slots and workflow steps refer to it.
    const kind = v.kind === 'openApp' ? 'openPath' : ACTION_KINDS.find(k => k === v.kind);
    if (!kind) return [];
    return [{ id: idOf(v.id), name: str(v.name, 80), nameEn: str(v.nameEn, 80), kind,
      input: inputOf(v.input), value: str(v.value),
      ...(kind === 'ai' && obj(v.aiCustom) ? { aiCustom: {
        description: str(v.aiCustom.description), source: str(v.aiCustom.source),
        instruction: typeof v.aiCustom.instruction === 'string' && v.aiCustom.instruction.length <= 20000 ? v.aiCustom.instruction : '',
        feedback: str(v.aiCustom.feedback, 4000),
      } } : {}),
      windows: kind === 'script' ? scriptSource(v.windows) : str(v.windows),
      mac: kind === 'script' ? scriptSource(v.mac) : str(v.mac),
      profileId: idOf(v.profileId), timeoutS: typeof v.timeoutS === 'number' && Number.isFinite(v.timeoutS)
        ? Math.min(1800, Math.max(1, Math.round(v.timeoutS))) : kind === 'ai' ? 120 : 30,
      output: v.output === 'copy' || v.output === 'paste' ? v.output : 'card' } satisfies ActionDefinition];
  }));
  const workflows = unique(list(raw.workflows).flatMap(v => {
    if (!obj(v) || !idOf(v.id)) return [];
    return [{ id: idOf(v.id), name: str(v.name, 80), steps: list(v.steps).slice(0, 50).flatMap(s =>
      obj(s) && idOf(s.id) && idOf(s.actionId) ? [{ id: idOf(s.id), actionId: idOf(s.actionId), input: inputOf(s.input) }] : []) }];
  }));
  const bindings = new Map<string, string>();
  for (const flow of workflows) {
    const ref = workflowBindingId(flow.id);
    bindings.set(ref, ref);
  }
  for (const action of actions) {
    if (action.kind !== 'workflow') bindings.set(action.id, action.id);
    else if (bindings.has(workflowBindingId(action.value))) bindings.set(action.id, workflowBindingId(action.value));
  }
  const wheels = unique(list(raw.wheels).flatMap(v => {
    if (!obj(v) || !idOf(v.id)) return [];
    const slots = list(v.slots);
    const slotCount = normalizeSlotCount(v.slotCount);
    const names = list(v.slotNames);
    const capacity = Math.max(slotCount, Math.min(WHEEL_SLOT_LIMITS.max, Math.max(8, slots.length, list(v.effects).length, names.length)));
    return [{ id: idOf(v.id), name: str(v.name, 80), nameEn: str(v.nameEn, 80),
      slotCount, effects: normalizeEffects(v.effects, capacity),
      slotNames: Array.from({ length: capacity }, (_, i) => str(names[i], 80).replace(/[\r\n\t]/g, ' ').trim()),
      slots: Array.from({ length: capacity }, (_, i) => typeof slots[i] === 'string' ? bindings.get(slots[i]) ?? null : null) }];
  }));
  if (!wheels.length) wheels.push({ id: 'tools', name: '常用工具', nameEn: 'Everyday tools', slotCount: 8, slots: Array(8).fill(null), effects: [...DEFAULT_WHEEL], slotNames: Array(8).fill('') });
  const profiles = unique(list(raw.profiles).slice(0, 20).flatMap(v => {
    if (!obj(v) || !idOf(v.id)) return [];
    return [{ id: idOf(v.id), name: str(v.name, 80), kind: 'builtin', provider: DESK_PROVIDERS.find(p => p.id === v.provider)?.id ?? 'custom',
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
    const input = usesActionInput(a.kind, true) ? step.input : 'none';
    if (i === 0 && input === 'previous') issues.push({ step: i, code: 'previous' });
    const incomingImage: boolean = input === 'screenshot' || (input === 'previous' && image);
    if (incomingImage && ['script', 'pasteText', 'openUrl', 'openPath'].includes(a.kind)) issues.push({ step: i, code: 'image' });
    image = a.kind === 'screenshot' || (incomingImage && ['writeClipboard', 'delay', 'switchWheel', 'shortcut'].includes(a.kind));
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
