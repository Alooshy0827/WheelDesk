import { useEffect, useRef, useState } from 'react';
import type { DeskOverlay } from '../../shared/ipc';
import { deskText, type Lang } from '../../shared/i18n';
import { DEFAULT_WHEEL, FALLBACK_TEXTURE, TICK_SOUND, allSoundNames, pingById, soundUrl, textureUrl } from '../../shared/pings';
import { DEFAULT_SETTINGS, soundLevel } from '../../shared/settings';
import { Wheel } from '../overlay/wheel';
import { spawnPing } from '../overlay/pingFx';
import { SoundBank } from '../overlay/soundBank';
import { IdleWatch } from '../overlay/idleWatch';
import '../overlay/wheel-effects.css';

/** Original lolPing renderer and effects; action execution stays exclusively in the main process. */
export function Overlay() {
  const svg = useRef<SVGSVGElement>(null), pings = useRef<HTMLDivElement>(null);
  const [captureLang, setCaptureLang] = useState<Lang | null>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!svg.current || !pings.current) return;
    const layer = pings.current;
    const sounds = new SoundBank();
    const soundsReady = sounds.load(allSoundNames().map(key => ({ key, url: soundUrl(key) })));
    let visual: NonNullable<DeskOverlay['visual']> = DEFAULT_SETTINGS;
    let capturing = false;
    let live = true;
    const wheel = new Wheel(svg.current, 'WheelDesk', textureUrl(FALLBACK_TEXTURE), () => {
      if (visual.tickSound) sounds.play(TICK_SOUND, soundLevel(visual) * 0.5);
    });
    const idle = new IdleWatch(() => !capturing && !wheel.isOpen && !layer.childElementCount,
      value => { if (live) void window.desk.invoke({ type: 'overlayIdle', idle: value }); });
    const observer = new MutationObserver(() => idle.check());
    observer.observe(layer, { childList: true });
    const unsubscribe = window.desk.onOverlay(event => {
      if (event.visual) visual = event.visual;
      if (event.type === 'open') {
        capturing = false; setCaptureLang(null); setRect(null); drag.current = null;
        const effects = event.effects ?? DEFAULT_WHEEL;
        wheel.setItems(effects.map((effect, i) => ({ key: String(i),
          icon: textureUrl(pingById(effect)?.icon ?? FALLBACK_TEXTURE), label: event.labels?.[i] ?? '' })));
        wheel.setDimmed(effects.flatMap((_, i) => event.enabled?.[i] === false ? [String(i)] : []));
        wheel.setCenterLabel(event.name ?? 'WheelDesk');
        wheel.setSize(visual.wheelSizePx);
        wheel.open(event.x ?? 0, event.y ?? 0);
      } else if (event.type === 'move') wheel.move(event.x ?? 0, event.y ?? 0);
      else if (event.type === 'effect') {
        const def = event.effect ? pingById(event.effect) : undefined;
        if (def) {
          spawnPing(layer, def, event.x ?? 0, event.y ?? 0,
            { sizePx: visual.pingSizePx, durationS: visual.pingDurationS, label: event.name });
          const volume = soundLevel(visual);
          void soundsReady.then(() => { if (live) sounds.play(def.sound, volume); });
        }
      } else if (event.type === 'capture') {
        wheel.cancel(); layer.replaceChildren(); capturing = true;
        setCaptureLang(event.lang ?? 'en'); setRect(null); drag.current = null;
      } else {
        wheel.cancel();
        if (event.clear) { layer.replaceChildren(); capturing = false; setCaptureLang(null); }
      }
      idle.check();
    });
    idle.check();
    return () => { live = false; unsubscribe(); observer.disconnect(); wheel.cancel(); layer.replaceChildren(); };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && captureLang) void window.desk.invoke({ type: 'capture', rect: null }); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [captureLang]);
  return <>
    <svg id="wheel" ref={svg} viewBox="-300 -300 600 600" aria-label="WheelDesk"/>
    <div ref={pings} className="desk-effects"/>
    {captureLang && <div className="capture" onContextMenu={e => { e.preventDefault(); void window.desk.invoke({ type: 'capture', rect: null }); }}
      onPointerDown={e => { if (e.button !== 0) return; drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { const a = drag.current; if (a) setRect({ x: Math.min(a.x, e.clientX), y: Math.min(a.y, e.clientY), w: Math.abs(a.x - e.clientX), h: Math.abs(a.y - e.clientY) }); }}
      onPointerUp={() => { if (rect && rect.w >= 3 && rect.h >= 3) void window.desk.invoke({ type: 'capture', rect }); drag.current = null; }}>
      <div className="capture-hint">{deskText(captureLang).captureHint}</div>
      {rect && <div className="capture-rect" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}/>}</div>}
  </>;
}
