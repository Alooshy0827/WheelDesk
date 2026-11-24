import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DeskCommand, DeskReply, DeskState } from '../../shared/ipc';
import { deskError, deskText } from '../../shared/i18n';
import { Icon } from './Wheel';
import { playUiSound, preloadUiSounds, setUiAudioSettings } from './uiSounds';

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'strong', 'em', 'del', 's', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span',
];
const ALLOWED_ATTR = ['class', 'start'];

export function sanitizeResultMarkdown(md: string): string {
  const html = marked.parse(md, { async: false, gfm: true, breaks: true });
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false });
}

function MarkdownContent({
  text,
  copyLabel,
  copiedLabel,
  onCopyCode,
}: {
  text: string;
  copyLabel: string;
  copiedLabel: string;
  onCopyCode: (code: string) => Promise<boolean>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => sanitizeResultMarkdown(text), [text]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const pre of [...root.querySelectorAll('pre')]) {
      const code = pre.querySelector('code');
      const raw = code?.textContent ?? pre.textContent ?? '';
      const langClass = code?.className.match(/\blanguage-([a-zA-Z0-9_+#.-]+)\b/)?.[1] ?? '';
      const wrap = document.createElement('div');
      wrap.className = 'md-code-wrap';
      const bar = document.createElement('div');
      bar.className = 'md-code-bar';
      const lang = document.createElement('span');
      lang.className = 'md-code-lang';
      lang.textContent = langClass ? langClass.toUpperCase() : 'CODE';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'md-code-copy';
      btn.textContent = copyLabel;
      btn.addEventListener('click', () => {
        playUiSound('click');
        void onCopyCode(raw).then(ok => {
          if (!ok) return;
          btn.textContent = copiedLabel;
          btn.classList.add('done');
          timers.push(setTimeout(() => {
            btn.textContent = copyLabel;
            btn.classList.remove('done');
          }, 1500));
        });
      });
      bar.append(lang, btn);
      pre.parentNode?.insertBefore(wrap, pre);
      wrap.append(bar, pre);
    }
    return () => { for (const timer of timers) clearTimeout(timer); };
  }, [html, copyLabel, copiedLabel, onCopyCode]);

  return <div ref={ref} className="answer md-body" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function ResultView() {
  const [state, setState] = useState<DeskState | null>(null);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [inputText, setInputText] = useState('');
  const [followUpText, setFollowUpText] = useState('');
  const [sendingFollowUp, setSendingFollowUp] = useState(false);
  const previousRunStatus = useRef<DeskState['run']['status'] | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    preloadUiSounds();
    const receive = (s: DeskState) => {
      setUiAudioSettings(s.settings);
      if (previousRunStatus.current === 'running' && s.run.status === 'completed') playUiSound('success');
      previousRunStatus.current = s.run.status;
      setState(s);
    };
    void window.desk.invoke({ type: 'state' }).then(r => { if (r.state) receive(r.state); });
    return window.desk.onState(receive);
  }, []);

  useEffect(() => {
    const el = contentRef.current;
    if (el && state?.run.status === 'running') el.scrollTop = el.scrollHeight;
  }, [state?.run.text, state?.run.history?.length, state?.run.status]);

  if (!state) return <div className="loading">WheelDesk</div>;
  const t = deskText(state.lang);
  const r = state.run;
  const running = r.status === 'running' || r.status === 'input';

  const notice = (text: string, error = false) => { setMessage(text); setIsError(error); };
  const invoke = async (command: DeskCommand): Promise<DeskReply> => {
    try {
      const reply = await window.desk.invoke(command);
      if (!reply.ok && reply.error) notice(reply.error, true);
      return reply;
    } catch {
      notice(t.failed, true);
      return { ok: false };
    }
  };

  const copyCode = async (code: string): Promise<boolean> => {
    const reply = await invoke({ type: 'copyText', text: code });
    return reply.ok;
  };

  const submitFollowUp = async () => {
    const trimmed = followUpText.trim();
    if (!trimmed || sendingFollowUp || running) return;
    playUiSound('confirm');
    setSendingFollowUp(true);
    setMessage('');
    try {
      const reply = await invoke({ type: 'followUp', text: trimmed });
      if (reply.ok) setFollowUpText('');
    } finally {
      setSendingFollowUp(false);
    }
  };

  return <main className="result-card">
    <header className="result-header">
      <span className="brand-mark"><Icon kind="ai"/></span>
      <b>{r.name || t.result}</b>
      <button className="icon-button" title={t.close} onClick={() => { playUiSound('cancel'); void invoke({ type: 'close' }); }}>×</button>
    </header>
    <div className="result-status">
      <span className={running ? 'pulse' : 'status-dot'}/>
      {r.status === 'input' ? t.askInput : t[r.status]}
      <span>{r.total > 0 ? `${r.step} / ${r.total}` : ''}</span>
    </div>
    {r.status === 'input' ? <>
      <p className="muted">{t.inputHint}</p>
      <textarea className="input-box" value={inputText} onChange={e => setInputText(e.target.value)} autoFocus/>
      <div className="toolbar">
        <button onClick={() => { playUiSound('click'); void invoke({ type: 'input', clipboard: true }); }}>{t.useClipboard}</button>
        <button className="primary" onClick={() => { playUiSound('confirm'); void invoke({ type: 'input', text: inputText }).then(reply => { if (reply.ok) setInputText(''); }); }}>{t.continue}</button>
      </div>
    </> : <div ref={contentRef} className="result-content">
      {r.image && <img src={r.image} alt={t.result}/>}
      {r.history && r.history.length > 0 && <div className="result-history">
        {r.history.map((turn, idx) => turn.role === 'user'
          ? <div key={idx} className="result-turn-user">{turn.text}</div>
          : <div key={idx} className="result-turn-assistant"><MarkdownContent text={turn.text} copyLabel={t.copyCode} copiedLabel={t.copied} onCopyCode={copyCode}/></div>)}
      </div>}
      {r.text && <MarkdownContent text={r.text} copyLabel={t.copyCode} copiedLabel={t.copied} onCopyCode={copyCode}/>}
      {r.error && <div className="error-box">{deskError(r.error, state.lang)}</div>}
      {!r.text && !r.image && running && <div className="thinking"><i/><i/><i/></div>}
    </div>}
    {r.canFollowUp && !running && r.status !== 'input' && <div className="result-followup" onMouseDown={() => void invoke({ type: 'focusResult' })}>
      <input
        className="followup-input"
        type="text"
        value={followUpText}
        placeholder={t.followUpPlaceholder}
        disabled={sendingFollowUp}
        onChange={e => setFollowUpText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void submitFollowUp(); } }}
      />
      <button className="primary followup-send" disabled={sendingFollowUp || !followUpText.trim()} onClick={() => void submitFollowUp()}>{t.followUpSend}</button>
    </div>}
    {message && <div role="status" className={isError ? 'message error' : 'message'}>{message}</div>}
    <footer className="result-footer">
      {running
        ? <button onClick={() => { playUiSound('cancel'); void invoke({ type: 'cancel' }); }}>{t.cancel}</button>
        : <>
          <button disabled={!r.text && !r.image} onClick={() => { playUiSound('click'); void invoke({ type: 'copy' }).then(reply => { if (reply.ok) notice(t.copied); }); }}>{t.copy}</button>
          <button className="primary" disabled={!r.text} onClick={() => { playUiSound('confirm'); void invoke({ type: 'paste' }); }}>{t.paste}</button>
        </>}
      <small>{r.inputTokens + r.outputTokens > 0 ? `${r.inputTokens + r.outputTokens} tokens` : 'WheelDesk'}</small>
    </footer>
  </main>;
}
