// L'unica porta tra le finestre e il disco. Niente Node nelle pagine.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cutx', {
  stash: () => ipcRenderer.invoke('stash:stato'),
  scegliStash: () => ipcRenderer.invoke('stash:scegli'),
  salvaConfig: (config) => ipcRenderer.invoke('stash:salva', config),
  crashaCuffia: () => ipcRenderer.send('cuffia:crasha'),
  suCuffiaRiavvio: (fn) => ipcRenderer.on('cuffia-riavvio', () => fn()),
  log: (nome, riga) => ipcRenderer.send('log', nome, riga),
  percorsoLog: () => ipcRenderer.invoke('log:percorso'),
});

// Il canale diretto controllo ↔ cuffia: il preload lo passa alla pagina.
ipcRenderer.on('porta-cuffia', (e) => window.postMessage('porta-cuffia', '*', e.ports));
