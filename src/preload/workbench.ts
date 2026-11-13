import { contextBridge, ipcRenderer } from 'electron';
import { DESK_CH, type DeskApi, type DeskState, type DeskOverlay } from '../shared/ipc';
const api: DeskApi = {
  invoke: command => ipcRenderer.invoke(DESK_CH.invoke, command),
  onState: cb => {
    const listener = (_event: Electron.IpcRendererEvent, state: DeskState) => cb(state);
    ipcRenderer.on(DESK_CH.state, listener);
    return () => ipcRenderer.removeListener(DESK_CH.state, listener);
  },
  onOverlay: cb => {
    const listener = (_event: Electron.IpcRendererEvent, state: DeskOverlay) => cb(state);
    ipcRenderer.on(DESK_CH.overlay, listener);
    return () => ipcRenderer.removeListener(DESK_CH.overlay, listener);
  },
};
contextBridge.exposeInMainWorld('desk', api);
