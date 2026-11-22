const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  chromeVersion: process.versions.chrome || '',
  preparePartition: (partition) => ipcRenderer.invoke('wa:prepare-partition', partition),
  clearPartition: (partition) => ipcRenderer.invoke('wa:clear-partition', partition),
  pickMediaFile: (filterKind) => ipcRenderer.invoke('wa:pick-media-file', filterKind),
  readMediaBytes: (payload) => ipcRenderer.invoke('wa:read-media-bytes', payload),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  minimizeWindow: () => ipcRenderer.invoke('app:minimize-window'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('app:toggle-maximize-window'),
  closeWindow: () => ipcRenderer.invoke('app:close-window'),
  onOpenNewTab: (callback) => {
    const listener = (_event, payload) => {
      if (payload?.url) callback(payload.url);
    };
    ipcRenderer.on('browser:new-tab', listener);
    return () => ipcRenderer.removeListener('browser:new-tab', listener);
  }
});
