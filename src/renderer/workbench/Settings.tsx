import { Button, Combobox, Dropdown, FluentProvider, Input, Option, Textarea, webDarkTheme, webLightTheme, motionTokens } from '@fluentui/react-components';
import { Add24Regular, Apps24Regular, ArrowSync24Regular, Copy24Regular, Cursor24Regular, DataPie24Regular, Delete24Regular, Info24Regular, LocalLanguage24Regular, Play24Regular, Power24Regular, Rocket24Regular, Settings24Regular, ShieldKeyhole24Regular, Sparkle24Regular, ResizeLarge24Regular, Timer24Regular, Speaker224Regular, SpeakerMute24Regular, MusicNote224Regular } from '@fluentui/react-icons';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { DeskCommand, DeskReply, DeskState } from '../../shared/ipc';
import { ACTION_KINDS, INPUT_SOURCES, hasPreparedInstruction, defaultWorkbench, newAction, resizeWheel, setWheelEffects, validateWorkflow, type ActionDefinition, type ActionKind, type InputSource, type WorkbenchSettings } from '../../shared/actions';
import { WHEEL_SLOT_LIMITS } from '../../shared/geometry';
import { applyModelPreset, DESK_PROVIDERS } from '../../shared/workbenchModels';
import { keyboardTriggers, triggerLabel, type Settings, type TriggerKey } from '../../shared/settings';
import { deskError, deskText, strings } from '../../shared/i18n';
import { ExpanderRow, OnOffSwitch, SettingRow, SliderRow, SwitchRow } from '../settings/components/rows';
import { WheelEditor } from '../settings/components/WheelEditor';
import { DraftInput } from '../settings/components/mateFields';
import { TextContext } from '../settings/text';
import { macDarkTheme, macLightTheme } from '../settings/macTheme';
import { barFrames } from '../settings/navIndicator';
import { ALL_PINGS, DEFAULT_WHEEL, FALLBACK_TEXTURE, textureUrl } from '../../shared/pings';
import '../settings/settings.css';
import '../settings/mac.css';
import './settings-additions.css';

const uid = () => crypto.randomUUID();
const logo = '../wheeldesk-icon.png';
const sectionIds = ['trigger', 'wheels', 'actions', 'workflows', 'models', 'general'] as const;
type Section = typeof sectionIds[number];
function Choice({ value, options, onChange, label, disabled }: { disabled?: boolean; value: string; options: { id: string; name: string }[]; onChange(value: string): void; label: string }) {
  return <Dropdown disabled={disabled} aria-label={label} value={options.find(o => o.id === value)?.name ?? '—'} selectedOptions={[value]}
    onOptionSelect={(_, data) => { if (data.optionValue !== undefined) onChange(data.optionValue); }}>
    {options.map(o => <Option key={o.id} value={o.id} text={o.name}>{o.name}</Option>)}
  </Dropdown>;
}
function EditField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <div className="wdField"><span>{label}</span><div>{children}{hint && <span className="desc">{hint}</span>}</div></div>;
}
export function SettingsApp() {
  const [state, setState] = useState<DeskState | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const draftRef = useRef<Settings | null>(null);
  const revision = useRef(0), savedRevision = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [dark, setDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches);
  const [active, setActive] = useState<Section>('trigger');
  const main = useRef<HTMLElement>(null), nav = useRef<HTMLElement>(null), bar = useRef<HTMLSpanElement>(null);
  const barTop = useRef<number | null>(null), jumping = useRef(false);
  const [wheelId, setWheelId] = useState(''), [actionId, setActionId] = useState(''), [flowId, setFlowId] = useState(''), [profileId, setProfileId] = useState('');
  const [key, setKey] = useState(''), [modelIds, setModelIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [aiPending, setAiPending] = useState(false);
  const aiBusy = useRef(false);
  const [modelOperation, setModelOperation] = useState('');
  const [keyVisible, setKeyVisible] = useState(false);
  const [modelQuery, setModelQuery] = useState('');
  const modelBusy = useRef(false), modelRevision = useRef(0);
  const [modelStatus, setModelStatus] = useState<{ text: string; error: boolean } | null>(null);
  useEffect(() => {
    const receive = (s: DeskState) => {
      setState(s); document.documentElement.dataset.platform = s.platform; document.documentElement.lang = s.lang;
      if (revision.current === savedRevision.current) { draftRef.current = structuredClone(s.settings); setDraft(draftRef.current); }
    };
    void window.desk.invoke({ type: 'state' }).then(r => { if (r.state) receive(r.state); });
    const unsubscribe = window.desk.onState(receive);
    const media = matchMedia('(prefers-color-scheme: dark)');
    const change = () => setDark(media.matches); media.addEventListener('change', change);
    return () => { unsubscribe(); media.removeEventListener('change', change); };
  }, []);
  useLayoutEffect(() => {
    const item = nav.current?.querySelector<HTMLElement>(`[data-section="${active}"]`);
    if (!item || !bar.current) return;
    const top = item.offsetTop + (item.offsetHeight - 16) / 2, previous = barTop.current;
    bar.current.style.top = `${top}px`; barTop.current = top;
    if (previous !== null && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      bar.current.animate(barFrames(previous, top, 16), { duration: motionTokens.durationSlow, easing: motionTokens.curveDecelerateMid });
  }, [active, state?.lang]);
  if (!state || !draft) return null;
  const t = deskText(state.lang), upstream = { ...strings(state.lang, state.platform), wheelPickHint: (name: string) => t.wheelPick.replace('{{name}}', name) }, wb = draft.workbench;
  const theme = state.platform === 'mac' ? dark ? macDarkTheme : macLightTheme : dark ? webDarkTheme : webLightTheme;
  const name = (a: { name: string; nameEn?: string }) => state.lang === 'en' ? a.nameEn || a.name : a.name;
  const notice = (text: string, error = false) => { setMessage(text); setFailed(error); };
  const invoke = async (cmd: DeskCommand): Promise<DeskReply> => {
    try { const r = await window.desk.invoke(cmd); if (!r.ok) notice(r.error ?? t.failed, true); return r; }
    catch { notice(t.failed, true); return { ok: false }; }
  };
  const flush = (): Promise<boolean> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const at = revision.current, settings = structuredClone(draftRef.current);
    if (!settings) return Promise.resolve(false);
    queue.current = queue.current.catch(() => false).then(async () => {
      const reply = await invoke({ type: 'save', settings });
      if (reply.ok) {
        savedRevision.current = at;
        if (reply.state && revision.current === at) { draftRef.current = structuredClone(reply.state.settings); setDraft(draftRef.current); }
        notice(t.saved);
      }
      return reply.ok;
    });
    return queue.current;
  };
  const changeSettings = (patch: Partial<Settings>) => {
    if (!draftRef.current) return;
    revision.current++; draftRef.current = { ...draftRef.current, ...patch }; setDraft(draftRef.current);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 300);
  };
  const edit = (patch: Partial<WorkbenchSettings>) => changeSettings({ workbench: { ...(draftRef.current?.workbench ?? wb), ...patch } });
  const run = async (id: string) => { if (await flush()) { const r = await invoke({ type: 'run', id }); if (r.ok) notice(t.testing + ' · ' + t.testHint); } };
  const show = (id: Section) => {
    const element = document.getElementById(id); if (!element || !main.current) return;
    const top = Math.min(main.current.scrollHeight - main.current.clientHeight, element.offsetTop - main.current.offsetTop);
    jumping.current = Math.abs(main.current.scrollTop - top) > 1;
    main.current.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); setActive(id);
  };
  const onScroll = () => {
    if (!main.current || jumping.current) return;
    let id: Section = 'trigger';
    for (const section of sectionIds) { const el = document.getElementById(section); if (el && el.offsetTop - main.current.offsetTop - 40 <= main.current.scrollTop) id = section; }
    setActive(id);
  };
  const remove = (fn: () => void) => { if (window.confirm(t.confirmDelete)) fn(); };
  const source = (value: InputSource, onChange: (s: InputSource) => void, previous = true) => <Choice label={t.input} value={value} options={INPUT_SOURCES.filter(i => previous || i !== 'previous').map(id => ({ id, name: t.source[id] }))} onChange={v => onChange(v as InputSource)}/>;
  const wheel = wb.wheels.find(w => w.id === wheelId) ?? wb.wheels.find(w => w.id === wb.activeWheelId) ?? wb.wheels[0];
  const effects = wheel.effects.slice(0, wheel.slotCount);
  const slotLabels = effects.map((_, i) => wheel.slotCount === 8 ? upstream.slotNames[i] : `${t.slot} ${i + 1}`);
  const action = wb.actions.find(a => a.id === actionId) ?? wb.actions[0];
  const flow = wb.workflows.find(f => f.id === flowId) ?? wb.workflows[0];
  const profile = wb.profiles.find(p => p.id === profileId) ?? wb.profiles[0];
  const patchAction = (patch: Partial<ActionDefinition>) => edit({ actions: wb.actions.map(a => a.id === action.id ? { ...a, ...patch } : a) });
  const patchCustom = (patch: Partial<NonNullable<ActionDefinition['aiCustom']>>) => {
    if (action.aiCustom) patchAction({ aiCustom: { ...action.aiCustom, ...patch } });
  };
  const createAI = (slot?: number) => {
    const id = uid();
    edit({ actions: [...wb.actions, { ...newAction(id, 'ai'), name: t.newAIAction, nameEn: t.newAIAction,
      aiCustom: { description: '', source: '', instruction: '', feedback: '' } }],
      ...(slot === undefined ? {} : { wheels: wb.wheels.map(w => w.id === wheel.id ? { ...w,
        slots: w.slots.map((value, i) => i === slot ? id : value) } : w) }) });
    setActionId(id); show('actions');
  };
  const prepareAI = async () => {
    if (aiBusy.current || !action?.aiCustom) return;
    aiBusy.current = true; setAiPending(true); notice(t.preparingAI);
    try {
      if (!await flush()) return;
      notice(t.preparingAI);
      const reply = await invoke({ type: 'prepareAI', id: action.id, regenerate: true });
      if (reply.ok && reply.state) {
        draftRef.current = structuredClone(reply.state.settings); setDraft(draftRef.current);
        notice(t.aiReady);
      }
    } finally { aiBusy.current = false; setAiPending(false); }
  };

  const patchFlow = (patch: Partial<typeof flow>) => edit({ workflows: wb.workflows.map(f => f.id === flow.id ? { ...f, ...patch } : f),
    ...(patch.name !== undefined ? { actions: wb.actions.map(a => a.kind === 'workflow' && a.value === flow.id ? { ...a, name: patch.name ?? '', nameEn: patch.name ?? '' } : a) } : {}) });
  const resetModelStatus = () => { modelRevision.current++; setModelStatus(null); setModelIds([]); setModelQuery(''); setKeyVisible(false); };
  const patchProfile = (patch: Partial<typeof profile>) => {
    modelRevision.current++; setModelStatus(null);
    if (patch.baseUrl !== undefined || patch.protocol !== undefined || patch.provider !== undefined) resetModelStatus();
    if (patch.baseUrl !== undefined || patch.protocol !== undefined || patch.provider !== undefined) setKey('');
    edit({ profiles: wb.profiles.map(p => p.id === profile.id ? { ...p, ...patch } : p) });
  };
  const modelRequest = async (type: 'check' | 'testModel' | 'key' | 'clearKey') => {
    if (modelBusy.current || !profile) return;
    modelBusy.current = true; setPending(true); setModelOperation(type); setModelStatus(null);
    const at = modelRevision.current, id = profile.id, draftKey = key;
    try {
      if (!await flush()) return;
      const reply = await window.desk.invoke(type === 'clearKey' ? { type: 'key', id, key: '' } : { type, id, key: draftKey });
      if (at !== modelRevision.current) return;
      if (!reply.ok) { setModelStatus({ text: reply.error ?? t.failed, error: true }); return; }
      if (type === 'key' || type === 'clearKey') { setKey(''); setModelStatus({ text: t.saved, error: false }); }
      else if (type === 'check') { setModelIds(reply.models ?? []); setModelQuery(''); setModelStatus({ text: t.modelsLoaded.replace('{{count}}', String(reply.models?.length ?? 0)), error: false }); }
      else {
        if (draftKey.trim()) {
          const saved = await window.desk.invoke({ type: 'key', id, key: draftKey.trim() });
          if (!saved.ok) { setModelStatus({ text: t.connectionSaveFailed + ' ' + (saved.error ?? t.failed), error: true }); return; }
          setKey(''); setKeyVisible(false);
        }
        setModelStatus({ text: t.connectionOK.replace('{{ms}}', String(reply.latencyMs ?? 0)), error: false });
      }
    } catch { if (at === modelRevision.current) setModelStatus({ text: t.failed, error: true }); }
    finally { modelBusy.current = false; setPending(false); setModelOperation(''); }
  };
  const sectionNames: Record<Section, string> = { trigger: upstream.navTrigger, wheels: t.wheels, actions: t.actions, workflows: t.workflows, models: t.models, general: t.general };
  const navIcons = [<Cursor24Regular/>, <DataPie24Regular/>, <Apps24Regular/>, <ArrowSync24Regular/>, <Sparkle24Regular/>, <Settings24Regular/>];
  const off = !draft.enabledOnStart;
  return <FluentProvider theme={theme} style={{ background: 'transparent', height: '100%' }}><TextContext.Provider value={upstream}>
    <div className="app wdSettings">
      <div className="titlebar"><img src={logo} alt=""/>WheelDesk</div>
      <nav className="side" ref={nav}><span className="navBar" ref={bar}/><div className="brand"><img src={logo} alt=""/><div><b>WheelDesk</b><span className="desc">{t.subtitle}</span></div></div>
        {sectionIds.map((id, i) => <button key={id} data-section={id} className={`navItem${active === id ? ' sel' : ''}`} onClick={() => show(id)}>{navIcons[i]}{sectionNames[id]}</button>)}
        <div className="wdSidebarFoot"><span className="desc">{t.about}</span><span role="status" className={failed ? 'wdError' : 'desc'}>{message}</span>{aiPending && <Button size="small" onClick={() => void invoke({ type: 'cancelPrepareAI' })}>{t.cancel}</Button>}{failed && <Button disabled={aiPending} size="small" onClick={() => void flush()}>{t.save}</Button>}</div>
      </nav>
      <main className="content" inert={aiPending} aria-busy={aiPending} ref={main} onScroll={onScroll} onScrollEnd={() => { jumping.current = false; }}>
        <h1 className="pageTitle">{upstream.pageTitle}</h1>
        {state.platform === 'mac' && state.helper === 'noAccess' && <div className="card permission"><span className="icon"><ShieldKeyhole24Regular/></span><div className="lbl"><b>{t.helperStates.noAccess}</b><p className="desc">{t.permissionsHint}</p><div className="wdButtons"><Button appearance="primary" onClick={() => void invoke({ type: 'accessibility' })}>{t.accessibility}</Button><Button onClick={() => void invoke({ type: 'retry' })}>{t.retry}</Button></div></div></div>}
        <div className="card status"><div className={`dot${state.helper === 'failed' || state.helper === 'noAccess' ? ' failed' : off ? ' off' : ''}`}/><img className="statusPing" src={logo} alt=""/><div className="lbl"><b>{state.helper === 'running' ? draft.enabledOnStart ? t.wheelEnabled : t.wheelDisabled : t.helperStates[state.helper]}</b><span className="desc">{t.wheelHelp}</span></div><OnOffSwitch checked={draft.enabledOnStart} onChange={enabledOnStart => changeSettings({ enabledOnStart })}/></div>
        <div className="section" id="trigger">{upstream.navTrigger}</div>
        <SettingRow icon={<Cursor24Regular/>} title={t.trigger} description={t.wheelHelp} dim={off}><Choice label={t.trigger} value={typeof draft.trigger === 'string' ? draft.trigger : 'custom'} options={[...keyboardTriggers(state.platform), 'mouse4', 'mouse5'].map(id => ({ id, name: triggerLabel(id as TriggerKey, state.lang, state.platform) }))} onChange={v => changeSettings({ trigger: v as TriggerKey })}/></SettingRow>
        <SwitchRow icon={<Power24Regular/>} title={t.enabled} checked={draft.enabledOnStart} onChange={v => changeSettings({ enabledOnStart: v })}/>
        <div className="section" id="wheels">{t.wheels}</div>
        <SettingRow icon={<DataPie24Regular/>} title={t.wheels} description={t.wheelSlotsHelp}><Choice label={t.wheels} value={wheel.id} options={wb.wheels.map(w => ({ id: w.id, name: name(w) }))} onChange={setWheelId}/><Button icon={<Add24Regular/>} aria-label={t.newWheel} onClick={() => { const id = uid(); edit({ wheels: [...wb.wheels, { id, name: t.newWheel, nameEn: t.newWheel, slotCount: 8, slots: Array(8).fill(null), effects: [...DEFAULT_WHEEL], slotNames: Array(8).fill('') }] }); setWheelId(id); }}/></SettingRow>
        <ExpanderRow icon={<Settings24Regular/>} title={name(wheel)} control={<div className="wdButtons"><Button icon={<Copy24Regular/>} onClick={() => { const id = uid(); edit({ wheels: [...wb.wheels, { ...structuredClone(wheel), id, name: wheel.name + ' 2', nameEn: wheel.nameEn + ' 2' }] }); setWheelId(id); }}>{t.duplicate}</Button><Button icon={<Delete24Regular/>} disabled={wb.wheels.length <= 1} onClick={() => remove(() => { edit({ wheels: wb.wheels.filter(w => w.id !== wheel.id) }); setWheelId(''); })}>{t.remove}</Button><Button appearance="primary" disabled={wb.activeWheelId === wheel.id} onClick={() => edit({ activeWheelId: wheel.id })}>{wb.activeWheelId === wheel.id ? t.active : t.activate}</Button></div>}><div className="expPane"><div className="mateFields"><span>{t.name}</span><DraftInput key={wheel.id + 'name'} value={wheel.name} maxLength={80} onSave={v => edit({ wheels: wb.wheels.map(w => w.id === wheel.id ? { ...w, name: v } : w) })}/><span>{t.nameEn}</span><DraftInput key={wheel.id + 'en'} value={wheel.nameEn} maxLength={80} onSave={v => edit({ wheels: wb.wheels.map(w => w.id === wheel.id ? { ...w, nameEn: v } : w) })}/></div></div></ExpanderRow>
        <SettingRow icon={<DataPie24Regular/>} title={t.spokeCount} description={t.spokeCountHelp}>
          <Choice label={t.spokeCount} value={String(wheel.slotCount)}
            options={Array.from({ length: WHEEL_SLOT_LIMITS.max - WHEEL_SLOT_LIMITS.min + 1 }, (_, i) => { const n = WHEEL_SLOT_LIMITS.min + i; return { id: String(n), name: t.spokes(n) }; })}
            onChange={value => edit({ wheels: wb.wheels.map(w => w.id === wheel.id ? resizeWheel(w, Number(value)) : w) })}/>
        </SettingRow>
        <WheelEditor key={`${wheel.id}-${wheel.slotCount}`} wheel={effects} slotLabels={slotLabels.map((label, i) => wheel.slotNames[i] || label)} center="generic" centerOn={false} centerEditable={false} centerLabel={t.cancel} trigger={triggerLabel(draft.trigger, state.lang, state.platform)}
          pool={ALL_PINGS.map(p => ({ id: p.id, name: upstream.pingNames[p.id], icon: textureUrl(p.icon) }))}
          defaults={{ wheel: ALL_PINGS.slice(0, wheel.slotCount).map(p => p.id), center: 'generic' }}
          labels={{ title: t.wheelPreview, desc: t.effectBindingHelp, poolTitle: t.originalEffects, poolDesc: t.effectPoolHelp }}
          onChange={p => { if (p.wheel) edit({ wheels: wb.wheels.map(w => w.id === wheel.id ? setWheelEffects(w, p.wheel ?? w.effects) : w) }); }}
          onPreview={effect => { void flush().then(ok => { if (ok) void invoke({ type: 'previewEffect', effect }); }); }}/>
        <div className="card mate wdBindings"><div className="mateHead"><b>{t.bindActions}</b></div><span className="desc">{t.slotNameHelp}</span>
          {effects.map((effect, i) => <div className="wdBinding" key={i}>
            <img src={textureUrl(ALL_PINGS.find(p => p.id === effect)?.icon ?? FALLBACK_TEXTURE)} alt=""/>
            <div><b>{slotLabels[i]}</b><span className="desc">{upstream.pingNames[effect]}</span></div>
            <div className="wdBindingControls">
              <label><span className="desc">{t.slotName}</span><DraftInput key={`${wheel.id}-${i}`} value={wheel.slotNames[i] ?? ''} maxLength={80}
                ariaLabel={`${t.slot} ${i + 1} · ${t.slotName}`} placeholder={name(wb.actions.find(a => a.id === wheel.slots[i]) ?? { name: upstream.pingNames[effect] })}
                onSave={value => edit({ wheels: wb.wheels.map(w => w.id === wheel.id ? { ...w, slotNames: w.slotNames.map((v, j) => i === j ? value : v) } : w) })}/></label>
              <Choice label={`${slotLabels[i]} · ${t.action}`} value={wheel.slots[i] ?? ''}
                options={[{ id: '', name: t.empty }, ...wb.actions.map(a => ({ id: a.id, name: name(a) }))]}
                onChange={id => edit({ wheels: wb.wheels.map(w => w.id === wheel.id ? { ...w, slots: w.slots.map((v, j) => i === j ? id || null : v) } : w) })}/>
              <Button size="small" appearance="subtle" icon={<Sparkle24Regular/>} onClick={() => createAI(i)}>{t.newAIAction}</Button>
            </div>
          </div>)}
        </div>
        <ExpanderRow icon={<Settings24Regular/>} title={t.effectSettings}>
          <SliderRow icon={<ResizeLarge24Regular/>} limit="wheelSizePx" title={upstream.wheelSize} value={draft.wheelSizePx} format={v => `${v} ${state.platform === 'mac' ? 'pt' : 'px'}`} onChange={wheelSizePx => changeSettings({ wheelSizePx })}/>
          <SliderRow icon={<ResizeLarge24Regular/>} limit="pingSizePx" title={t.effectSize} value={draft.pingSizePx} format={v => `${v} ${state.platform === 'mac' ? 'pt' : 'px'}`} onChange={pingSizePx => changeSettings({ pingSizePx })}/>
          <SliderRow icon={<Timer24Regular/>} limit="pingDurationS" title={t.effectDuration} value={draft.pingDurationS} format={v => `${v.toFixed(1)} s`} onChange={pingDurationS => changeSettings({ pingDurationS })}/>
          <SliderRow icon={<Speaker224Regular/>} limit="volume" title={upstream.volume} value={draft.volume} format={String} onChange={volume => changeSettings({ volume })} dim={draft.muted}/>
          <SwitchRow icon={<SpeakerMute24Regular/>} title={upstream.mute} checked={draft.muted} onChange={muted => changeSettings({ muted })}/>
          <SwitchRow icon={<MusicNote224Regular/>} title={upstream.tickSound} checked={draft.tickSound} onChange={tickSound => changeSettings({ tickSound })}/>
        </ExpanderRow>
        <div className="section" id="actions">{t.actions}</div>
        <SettingRow icon={<Apps24Regular/>} title={t.actions} description={t.testHint}><Choice label={t.actions} value={action?.id ?? ''} options={wb.actions.map(a => ({ id: a.id, name: name(a) }))} onChange={setActionId}/><Button icon={<Add24Regular/>} aria-label={t.newAction} onClick={() => createAI()}/></SettingRow>
        {action && <div className="card mate wdEditor" key={action.id}><div className="mateHead"><b>{name(action)}</b><Button icon={<Play24Regular/>} onClick={() => void run(action.id)}>{t.test}</Button><Button icon={<Delete24Regular/>} onClick={() => remove(() => edit({ actions: wb.actions.filter(a => a.id !== action.id) }))}>{t.remove}</Button></div>
          <EditField label={t.name}><Input value={action.name} maxLength={80} onChange={(_, d) => patchAction({ name: d.value })}/></EditField><EditField label={t.nameEn}><Input value={action.nameEn} maxLength={80} onChange={(_, d) => patchAction({ nameEn: d.value })}/></EditField>
          <EditField label={t.type}><Choice label={t.type} value={action.kind} options={ACTION_KINDS.map(id => ({ id, name: t.kind[id] }))} onChange={kind => patchAction({ ...newAction(action.id, kind as ActionKind), name: action.name, nameEn: action.nameEn })}/></EditField>
          {action.kind === 'ai' && <EditField label={t.aiMode}><Choice label={t.aiMode} value={action.aiCustom ? 'custom' : 'direct'}
            options={[{ id: 'custom', name: t.aiCustomMode }, { id: 'direct', name: t.aiDirectMode }]}
            onChange={mode => patchAction({ aiCustom: mode === 'custom' ? { description: action.value, source: '', instruction: '', feedback: '' } : undefined })}/></EditField>}
          <EditField label={t.input}>{source(action.input, input => patchAction({ input }), false)}</EditField>
          {action.kind === 'switchWheel' ? <EditField label={t.wheels}><Choice label={t.wheels} value={action.value} options={[{ id: '', name: '—' }, ...wb.wheels.map(w => ({ id: w.id, name: name(w) }))]} onChange={value => patchAction({ value })}/></EditField>
            : action.kind === 'workflow' ? <EditField label={t.workflows}><Choice label={t.workflows} value={action.value} options={[{ id: '', name: '—' }, ...wb.workflows]} onChange={value => patchAction({ value })}/></EditField>
            : !action.aiCustom && !['script', 'screenshot', 'readClipboard'].includes(action.kind) && <EditField label={t.value} hint={action.kind === 'ai' ? t.promptHint : action.kind === 'shortcut' ? t.shortcutHint : undefined}><Textarea value={action.value} rows={action.kind === 'ai' ? 5 : 2} maxLength={20000} onChange={(_, d) => patchAction({ value: d.value })}/></EditField>}
          {['script', 'openApp', 'openPath'].includes(action.kind) && <><EditField label={t.windows} hint={action.kind === 'script' ? t.scriptHint : t.platformHint}><Textarea className="wdCode" value={action.windows} rows={action.kind === 'script' ? 5 : 2} maxLength={20000} onChange={(_, d) => patchAction({ windows: d.value })}/></EditField><EditField label={t.mac}><Textarea className="wdCode" value={action.mac} rows={action.kind === 'script' ? 5 : 2} maxLength={20000} onChange={(_, d) => patchAction({ mac: d.value })}/></EditField></>}
          {action.kind === 'ai' && action.aiCustom && <>
            <EditField label={t.aiDescription} hint={t.aiDescriptionHint}><Textarea aria-label={t.aiDescription} value={action.aiCustom.description} rows={4} maxLength={20000}
              onChange={(_, d) => patchCustom({ description: d.value })}/></EditField>
            <p role="status" className={hasPreparedInstruction(action.aiCustom) ? 'wdModelSuccess' : 'desc'}>
              {hasPreparedInstruction(action.aiCustom) ? t.aiCached : action.aiCustom.instruction ? t.aiStale : t.aiUnprepared}</p>
            <EditField label={t.aiUnderstanding} hint={t.aiUnderstandingHint}><Textarea aria-label={t.aiUnderstanding} value={action.aiCustom.instruction} rows={6} maxLength={20000}
              onChange={(_, d) => patchCustom({ instruction: d.value, source: action.aiCustom?.description ?? '' })}/></EditField>
            <EditField label={t.aiFeedback} hint={t.aiFeedbackHint}><Textarea aria-label={t.aiFeedback} value={action.aiCustom.feedback} rows={2} maxLength={4000}
              onChange={(_, d) => patchCustom({ feedback: d.value })}/></EditField>
            <div className="wdButtons"><Button appearance="primary" disabled={!action.aiCustom.description.trim()} onClick={() => void prepareAI()}>
              {action.aiCustom.instruction ? t.aiRegenerate : t.aiGenerate}</Button></div>
            <p className="desc">{t.aiCostHint}</p>
          </>}
          {action.kind === 'ai' && <EditField label={t.model}><Choice label={t.model} value={action.profileId} options={[{ id: '', name: t.useDefault }, ...wb.profiles]} onChange={profileId => patchAction({ profileId })}/></EditField>}
          <EditField label={t.timeout}><Input type="number" min={1} max={1800} value={String(action.timeoutS)} onChange={(_, d) => patchAction({ timeoutS: Number(d.value) })}/></EditField>
          {['ai', 'script', 'screenshot'].includes(action.kind) && <EditField label={t.output}><Choice label={t.output} value={action.output} options={(['card', 'copy', 'paste'] as const).filter(o => action.kind !== 'screenshot' || o !== 'paste').map(id => ({ id, name: t.outputNames[id] }))} onChange={output => patchAction({ output: output as ActionDefinition['output'] })}/></EditField>}
        </div>}
        <div className="section" id="workflows">{t.workflows}</div>
        <SettingRow icon={<ArrowSync24Regular/>} title={t.workflows} description={t.sequenceHint}><Choice label={t.workflows} value={flow?.id ?? ''} options={wb.workflows} onChange={setFlowId}/><Button icon={<Add24Regular/>} aria-label={t.newWorkflow} onClick={() => { const id = uid(); edit({ workflows: [...wb.workflows, { id, name: t.newWorkflow, steps: [] }], actions: [...wb.actions, { ...newAction(uid(), 'workflow'), name: t.newWorkflow, nameEn: t.newWorkflow, value: id }] }); setFlowId(id); }}/></SettingRow>
        {flow ? <div className="card mate wdEditor"><div className="mateHead"><b>{flow.name}</b><Button icon={<Play24Regular/>} disabled={validateWorkflow(flow, wb).length > 0} onClick={() => { const a = wb.actions.find(a => a.kind === 'workflow' && a.value === flow.id); if (a) void run(a.id); }}>{t.test}</Button><Button icon={<Delete24Regular/>} onClick={() => remove(() => edit({ workflows: wb.workflows.filter(f => f.id !== flow.id), actions: wb.actions.filter(a => a.kind !== 'workflow' || a.value !== flow.id) }))}>{t.remove}</Button></div>
          <EditField label={t.name}><Input value={flow.name} maxLength={80} onChange={(_, d) => patchFlow({ name: d.value })}/></EditField>
          {flow.steps.map((s, i) => <div className="mateRule" key={s.id}><div className="mateHead"><b>{t.step} {i + 1}</b><Button size="small" disabled={i === 0} aria-label={t.up} onClick={() => { const steps = [...flow.steps]; [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; patchFlow({ steps }); }}>↑</Button><Button size="small" disabled={i === flow.steps.length - 1} aria-label={t.down} onClick={() => { const steps = [...flow.steps]; [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]]; patchFlow({ steps }); }}>↓</Button><Button size="small" aria-label={t.remove} onClick={() => patchFlow({ steps: flow.steps.filter(step => step.id !== s.id) })}>×</Button></div>
            <EditField label={t.action}><Choice label={t.action} value={s.actionId} options={wb.actions.filter(a => a.kind !== 'workflow').map(a => ({ id: a.id, name: name(a) }))} onChange={actionId => patchFlow({ steps: flow.steps.map(step => step.id === s.id ? { ...step, actionId } : step) })}/></EditField><EditField label={t.input}>{source(s.input, input => patchFlow({ steps: flow.steps.map(step => step.id === s.id ? { ...step, input } : step) }))}</EditField>
          </div>)}
          <div className="wdButtons"><Button icon={<Add24Regular/>} onClick={() => { const a = wb.actions.find(a => a.kind !== 'workflow'); if (a) patchFlow({ steps: [...flow.steps, { id: uid(), actionId: a.id, input: flow.steps.length ? 'previous' : a.input }] }); }}>{t.addStep}</Button></div>
          {validateWorkflow(flow, wb).map((issue, i) => <p className="wdError" key={i}>{t.step} {issue.step + 1}: {deskError(issue.code, state.lang)}</p>)}
        </div> : <div className="card notes"><div className="lbl">{t.noSteps}</div></div>}
        <div className="section" id="models">{t.models}</div>
        <SettingRow icon={<Sparkle24Regular/>} title={t.models} description={t.modelHint}><Choice disabled={pending} label={t.models} value={profile?.id ?? ''} options={wb.profiles} onChange={id => { setProfileId(id); setKey(''); resetModelStatus(); }}/><Button disabled={pending} icon={<Add24Regular/>} aria-label={t.newModel} onClick={() => { const id = uid(); edit({ profiles: [...wb.profiles, { id, name: 'OpenAI', kind: 'builtin', provider: 'openai', protocol: 'openai', baseUrl: 'https://api.openai.com/v1', model: '', tagColor: 3, tagColorCustom: null }], defaultProfileId: wb.defaultProfileId || id }); setProfileId(id); setKey(''); resetModelStatus(); }}/></SettingRow>
        {profile ? <div className="card mate wdEditor wdModelEditor"><fieldset className="wdModelFields" disabled={pending}><div className="mateHead"><b>{profile.name}</b><Button icon={<Delete24Regular/>} disabled={pending} onClick={() => remove(() => { resetModelStatus(); setKey(''); edit({ profiles: wb.profiles.filter(p => p.id !== profile.id) }); })}>{t.remove}</Button></div>
          <EditField label={'1 · ' + t.providerPreset} hint={t.presetHint}><Choice label={t.providerPreset} value={profile.provider} options={DESK_PROVIDERS.map(p => ({ id: p.id, name: t.providerNames[p.id as keyof typeof t.providerNames] ?? p.name }))} onChange={id => {
            if (id === profile.provider) return;
            const preset = DESK_PROVIDERS.find(p => p.id === id);
            const autoName = ['新模型', 'New model', ...DESK_PROVIDERS.map(p => p.name)].includes(profile.name);
            patchProfile({ ...applyModelPreset(profile, id), ...(autoName && preset ? { name: preset.name } : {}) });
          }}/></EditField>
          {profile.provider === 'custom' && <EditField label={t.baseUrl} hint={t.customUrlHint}><Input aria-label={t.baseUrl} placeholder="https://…/v1" value={profile.baseUrl} onChange={(_, d) => patchProfile({ baseUrl: d.value })}/></EditField>}
          <EditField label={'2 · ' + t.key} hint={['ollama', 'lmstudio'].includes(profile.provider) ? t.localKeyHint : t.apiKeyHint}>
            <Input aria-label={t.key} type={keyVisible ? 'text' : 'password'} autoComplete="new-password" placeholder={state.keyIds.includes(profile.id) ? t.savedKeyPlaceholder : t.keyPlaceholder} value={key}
              contentAfter={<Button appearance="transparent" size="small" onClick={() => setKeyVisible(!keyVisible)}>{keyVisible ? t.hideKey : t.showKey}</Button>}
              onChange={(_, d) => { setKey(d.value); modelRevision.current++; setModelStatus(null); setModelIds([]); }}/>
          </EditField>
          <EditField label={'3 · ' + t.chooseModel} hint={t.chooseModelHint}>
            <div className="wdModelPicker"><Combobox freeform aria-label={t.model} value={profile.model} placeholder={t.modelPlaceholder}
              selectedOptions={profile.model ? [profile.model] : []} onChange={e => { setModelQuery(e.target.value); patchProfile({ model: e.target.value }); }}
              onOptionSelect={(_, d) => { if (d.optionValue) { setModelQuery(''); patchProfile({ model: d.optionValue }); } }}>
              {modelIds.filter(id => !modelQuery || id.toLowerCase().includes(modelQuery.toLowerCase())).map(id => <Option key={id} value={id} text={id}>{id}</Option>)}
            </Combobox><Button disabled={pending} onClick={() => void modelRequest('check')}>{modelOperation === 'check' ? t.fetchingModels : t.check}</Button></div>
          </EditField>
          <div className="wdButtons"><Button appearance="primary" disabled={pending} onClick={() => void modelRequest('testModel')}>{modelOperation === 'testModel' ? t.connecting : t.saveAndTest}</Button>
            <Button disabled={pending || wb.defaultProfileId === profile.id} onClick={() => edit({ defaultProfileId: profile.id })}>{wb.defaultProfileId === profile.id ? t.isDefaultModel : t.makeDefaultModel}</Button></div>
          <p className="desc">{t.connectionHint}</p>
          {modelStatus && <p role="status" className={modelStatus.error ? 'wdError' : 'wdModelSuccess'}>{modelStatus.text}</p>}
          <ExpanderRow key={profile.id + profile.provider} icon={<Settings24Regular/>} title={t.modelAdvanced} description={t.modelAdvancedHint}>
            <div className="expPane">
              <EditField label={t.name}><Input aria-label={t.configName} value={profile.name} maxLength={80} onChange={(_, d) => patchProfile({ name: d.value })}/></EditField>
              {profile.provider !== 'custom' && <EditField label={t.baseUrl} hint={t.endpointKeyHint}><Input aria-label={t.baseUrl} value={profile.baseUrl} onChange={(_, d) => patchProfile({ baseUrl: d.value })}/></EditField>}
              <EditField label={t.protocol} hint={t.protocolHint}><Choice label={t.protocol} value={profile.protocol} options={[{ id: 'openai', name: t.openaiFormat }, { id: 'anthropic', name: t.anthropicFormat }]} onChange={protocol => patchProfile({ protocol: protocol as 'openai' | 'anthropic' })}/></EditField>
              <div className="wdButtons"><Button disabled={pending || !key.trim()} onClick={() => void modelRequest('key')}>{t.saveKeyOnly}</Button>
                <Button disabled={pending || !state.keyIds.includes(profile.id)} onClick={() => { if (window.confirm(t.clearKeyConfirm)) void modelRequest('clearKey'); }}>{t.clearKey}</Button></div>
            </div>
          </ExpanderRow>
        </fieldset></div> : <div className="card notes"><div className="lbl">{t.noModels}</div><Button appearance="primary" onClick={() => { const id = uid(); edit({ profiles: [{ id, name: 'OpenAI', kind: 'builtin', provider: 'openai', protocol: 'openai', baseUrl: 'https://api.openai.com/v1', model: '', tagColor: 3, tagColorCustom: null }], defaultProfileId: id }); setProfileId(id); }}>{t.newModel}</Button></div>}
        <div className="section" id="general">{t.general}</div>
        <SwitchRow icon={<Rocket24Regular/>} title={t.launch} description={upstream.launchAtStartupDesc} checked={draft.launchAtStartup} onChange={launchAtStartup => changeSettings({ launchAtStartup })}/>
        <SettingRow icon={<LocalLanguage24Regular/>} title={t.language}><Choice label={t.language} value={draft.language} options={[{ id: 'auto', name: t.auto }, { id: 'zh-CN', name: '简体中文' }, { id: 'en', name: 'English' }]} onChange={language => changeSettings({ language: language as Settings['language'] })}/></SettingRow>
        <SettingRow icon={<ShieldKeyhole24Regular/>} title={t.helper} description={t.permissionsHint}><Button onClick={() => void invoke({ type: 'retry' })}>{t.retry}</Button></SettingRow>
        {state.platform === 'mac' && <div className="card notes"><div className="wdButtons"><Button onClick={() => void invoke({ type: 'accessibility' })}>{t.accessibility}</Button><Button onClick={() => void invoke({ type: 'screenPermission' })}>{t.screenPermission}</Button></div></div>}
        <SettingRow icon={<Info24Regular/>} title={t.about} description={t.privacy}><Button onClick={() => void invoke({ type: 'data' })}>{t.data}</Button></SettingRow>
      </main>
    </div>
  </TextContext.Provider></FluentProvider>;
}
