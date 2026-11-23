import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { DeskApi, DeskState, DeskCommand, DeskReply, DeskOverlay } from '../../shared/ipc';
import { ACTION_KINDS, INPUT_SOURCES, newAction, validateWorkflow, type ActionDefinition, type ActionKind,
  type InputSource, type WorkbenchSettings, type WorkflowDefinition } from '../../shared/actions';
import type { Settings, TriggerKey } from '../../shared/settings';
import { deskText, deskError } from '../../shared/i18n';
import { Icon } from './Wheel';
import { Overlay } from './Overlay';
import { SettingsApp } from './Settings';
import { playUiSound, preloadUiSounds, setUiAudioSettings } from './uiSounds';
import './style.css';
declare global { interface Window { desk: DeskApi } }
const uid = () => crypto.randomUUID();
const initialRole = location.hash.slice(1) || 'settings';
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function App() {
  const [state, setState] = useState<DeskState | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const dirty = useRef(false);
  const [tab, setTab] = useState<'wheels' | 'actions' | 'workflows' | 'models' | 'general'>('wheels');
  const [selected, setSelected] = useState('');
  const [slot, setSlot] = useState(0);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [key, setKey] = useState('');
  const [inputText, setInputText] = useState('');
  const [modelIds, setModelIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const previousRunStatus = useRef<DeskState['run']['status'] | null>(null);
  useEffect(() => {
    preloadUiSounds();
    const receive = (s: DeskState) => {
      setUiAudioSettings(s.settings);
      if (previousRunStatus.current === 'running' && s.run.status === 'completed') playUiSound('success');
      previousRunStatus.current = s.run.status;
      setState(s);
      if (!dirty.current) setDraft(structuredClone(s.settings));
    };
    void window.desk.invoke({ type: 'state' }).then(r => { if (r.state) receive(r.state); });
    return window.desk.onState(receive);
  }, []);
  useEffect(() => { setSelected(''); setMessage(''); setKey(''); setModelIds([]); }, [tab]);
  if (!state || !draft) return <div className="loading">WheelDesk</div>;
  const currentState = state;
  const currentDraft = draft;
  const t = deskText(state.lang);
  const wb = draft.workbench;
  const name = (a: { name: string; nameEn?: string }) => state.lang === 'en' ? a.nameEn || a.name : a.name;
  const notice = (text: string, error = false) => { setMessage(text); setIsError(error); };
  const invoke = async (command: DeskCommand): Promise<DeskReply> => {
    try { const reply = await window.desk.invoke(command); if (!reply.ok) notice(reply.error ?? t.failed, true); return reply; }
    catch { notice(t.failed, true); return { ok: false }; }
  };
  const editSettings = (patch: Partial<Settings>) => { dirty.current = true; setDraft({ ...currentDraft, ...patch }); };
  const edit = (patch: Partial<WorkbenchSettings>) => editSettings({ workbench: { ...wb, ...patch } });
  const save = async (): Promise<boolean> => {
    const reply = await invoke({ type: 'save', settings: currentDraft });
    if (reply.ok) { dirty.current = false; if (reply.state) { setState(reply.state); setDraft(structuredClone(reply.state.settings)); } notice(t.saved); }
    return reply.ok;
  };
  const run = async (id: string) => { if (await save()) { const r = await invoke({ type: 'run', id }); if (r.ok) notice(t.testing + ' · ' + t.testHint); } };
  const sourceSelect = (value: InputSource, change: (value: InputSource) => void, previous = true) => <select value={value} onChange={e => change(e.target.value as InputSource)}>{INPUT_SOURCES.filter(s => previous || s !== 'previous').map(s => <option key={s} value={s}>{t.source[s]}</option>)}</select>;
  if (initialRole === 'result') {
    const r = state.run;
    const running = r.status === 'running' || r.status === 'input';
    return <main className="result-card">
      <header className="result-header"><span className="brand-mark"><Icon kind="ai"/></span><b>{r.name || t.result}</b><button className="icon-button" title={t.close} onClick={() => { playUiSound('cancel'); void invoke({ type: 'close' }); }}>×</button></header>
      <div className="result-status"><span className={running ? 'pulse' : 'status-dot'}/>{r.status === 'input' ? t.askInput : t[r.status]}<span>{r.total > 0 ? `${r.step} / ${r.total}` : ''}</span></div>
      {r.status === 'input' ? <><p className="muted">{t.inputHint}</p><textarea className="input-box" value={inputText} onChange={e => setInputText(e.target.value)} autoFocus/><div className="toolbar"><button onClick={() => { playUiSound('click'); void invoke({ type: 'input', clipboard: true }); }}>{t.useClipboard}</button><button className="primary" onClick={() => { playUiSound('confirm'); void invoke({ type: 'input', text: inputText }).then(reply => { if (reply.ok) setInputText(''); }); }}>{t.continue}</button></div></>
        : <div className="result-content">{r.image && <img src={r.image} alt={t.result}/>}<div className="answer">{r.text}</div>{r.error && <div className="error-box">{deskError(r.error, state.lang)}</div>}{!r.text && !r.image && running && <div className="thinking"><i/><i/><i/></div>}</div>}
      {message && <div role="status" className={isError ? 'message error' : 'message'}>{message}</div>}
      <footer className="result-footer">{running ? <button onClick={() => { playUiSound('cancel'); void invoke({ type: 'cancel' }); }}>{t.cancel}</button> : <><button disabled={!r.text && !r.image} onClick={() => { playUiSound('click'); void invoke({ type: 'copy' }).then(reply => { if (reply.ok) notice(t.copied); }); }}>{t.copy}</button><button className="primary" disabled={!r.text} onClick={() => { playUiSound('confirm'); void invoke({ type: 'paste' }); }}>{t.paste}</button></>}<small>{r.inputTokens + r.outputTokens > 0 ? `${r.inputTokens + r.outputTokens} tokens` : 'WheelDesk'}</small></footer>
    </main>;
  }
  return null;
}
document.body.classList.add(initialRole);
const root = document.getElementById('root');
if (root) createRoot(root).render(initialRole === 'overlay' ? <Overlay/> : initialRole === 'settings' ? <SettingsApp/> : <App/>);
