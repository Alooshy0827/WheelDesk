import { createRoot } from 'react-dom/client';
import type { DeskApi } from '../../shared/ipc';
import { Overlay } from './Overlay';
import { SettingsApp } from './Settings';
import { ResultView } from './ResultView';
import './style.css';

declare global { interface Window { desk: DeskApi } }

const initialRole = location.hash.slice(1) || 'settings';
document.body.classList.add(initialRole);
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    initialRole === 'overlay' ? <Overlay/> : initialRole === 'settings' ? <SettingsApp/> : <ResultView/>,
  );
}
