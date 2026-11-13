import { pickSlice } from '../../shared/geometry';
import { WHEEL_CENTER_RADIUS } from '../../shared/actions';
export const icons: Record<string, string> = {
  shortcut: 'M7 3H4a1 1 0 0 0-1 1v3a2 2 0 1 0 2-2h14a2 2 0 1 0-2-2v18a2 2 0 1 0 2-2H5a2 2 0 1 0 2 2V3',
  openApp: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  openPath: 'M3 6h7l2 3h9v11H3z M3 6V4h7l2 2h7v3',
  openUrl: 'M10 14l4-4 M8 16l-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 5 0 M13 16a4 4 0 0 0 5 0l5-5a4 4 0 0 0-5-5l-2 2',
  readClipboard: 'M8 4H5v17h14V4h-3 M8 2h8v5H8z M8 12h8 M8 16h5',
  writeClipboard: 'M8 4H5v17h14V4h-3 M8 2h8v5H8z M9 14l2 2 4-4',
  pasteText: 'M4 4h16 M12 4v16 M8 20h8 M4 4v3 M20 4v3',
  screenshot: 'M3 8V3h5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5 M8 8h8v8H8z',
  ai: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  script: 'M8 5L2 12l6 7 M16 5l6 7-6 7 M14 3l-4 18',
  delay: 'M12 5v7l4 3 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
  switchWheel: 'M3 7h17l-4-4 M21 17H4l4 4',
  workflow: 'M3 3h6v6H3z M15 15h6v6h-6z M6 9v9h9 M9 6h9v9',
};
export function Icon({ kind, size = 20 }: { kind: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[kind] ?? icons.shortcut}/></svg>;
}
const at = (r: number, deg: number) => ({ x: 180 + r * Math.cos(deg * Math.PI / 180), y: 180 + r * Math.sin(deg * Math.PI / 180) });
function sector(i: number): string {
  const a = -90 + i * 45 - 21.5, b = a + 43;
  const p = at(166, a), q = at(166, b), r = at(WHEEL_CENTER_RADIUS, b), s = at(WHEEL_CENTER_RADIUS, a);
  return `M${p.x},${p.y} A166,166 0 0 1 ${q.x},${q.y} L${r.x},${r.y} A${WHEEL_CENTER_RADIUS},${WHEEL_CENTER_RADIUS} 0 0 0 ${s.x},${s.y}Z`;
}
export function Wheel({ labels, kinds, name, hot, onSelect }: {
  labels: string[]; kinds: string[]; name: string; hot: number; onSelect?: (index: number) => void;
}) {
  return <svg className="wheel-svg" width="360" height="360" viewBox="0 0 360 360" aria-label={name}>
    {Array.from({ length: 8 }, (_, i) => {
      const p = at(115, -90 + i * 45);
      return <g key={i} className={`slice ${i === hot ? 'hot' : ''} ${!labels[i] ? 'empty' : ''}`}
        role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} aria-label={labels[i] || String(i + 1)}
        onClick={() => onSelect?.(i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(i); } }}>
        <path className="sector" d={sector(i)}/>
        <g transform={`translate(${p.x - 11}, ${p.y - 21})`}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={labels[i] ? icons[kinds[i]] ?? icons.shortcut : 'M6 12h12 M12 6v12'}/></svg></g>
        <text x={p.x} y={p.y + 18} textAnchor="middle">{(labels[i] || '—').length > 10 ? labels[i].slice(0, 9) + '…' : labels[i] || '—'}</text>
      </g>;
    })}
    <circle cx="180" cy="180" r="53" className="wheel-center"/>
    <text x="180" y="179" textAnchor="middle" className="center-name">{(hot >= 0 ? labels[hot] || name : name).slice(0, 10)}</text>
    <text x="180" y="199" textAnchor="middle" className="center-sub">{hot >= 0 ? String(hot + 1).padStart(2, '0') : 'WheelDesk'}</text>
  </svg>;
}
export const hotAt = (x: number, y: number) => pickSlice(x, y, WHEEL_CENTER_RADIUS);
