// L'unica porta tra le finestre e il disco. Niente Node nelle pagine.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cutx', {
  stash: () => ipcRenderer.invoke('stash:stato'),
  scegliStash: () => ipcRenderer.invoke('stash:scegli'),
  salvaConfig: (config) => ipcRenderer.invoke('stash:salva', config),
  suStashCambiato: (fn) => ipcRenderer.on('stash-cambiato', () => fn()),
  crasha: (chi) => ipcRenderer.send('crasha', chi),
  log: (nome, riga) => ipcRenderer.send('log', nome, riga),
  percorsoLog: () => ipcRenderer.invoke('log:percorso'),
});

// I canali diretti tra controllo, live e cuffia: il preload li passa alla pagina.
ipcRenderer.on('porta', (e, con) => window.postMessage({ porta: con }, '*', e.ports));
