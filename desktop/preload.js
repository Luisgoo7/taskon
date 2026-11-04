// Ponte entre a bolinha e o processo principal
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('taskon', {
  toggle: () => ipcRenderer.send('toggle'),
  menu: () => ipcRenderer.send('menu'),
  onState: (callback) => ipcRenderer.on('state', (_e, open) => callback(open)),
});
