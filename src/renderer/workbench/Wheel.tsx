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
