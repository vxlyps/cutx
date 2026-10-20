// L'unica porta tra le finestre e il disco. Niente Node nelle pagine.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cutx', {
  stash: () => ipcRenderer.invoke('stash:stato'),
  scegliStash: () => ipcRenderer.invoke('stash:scegli'),
  salvaConfig: (config) => ipcRenderer.invoke('stash:salva', config),
  suStashCambiato: (fn) => ipcRenderer.on('stash-cambiato', () => fn()),
  libreria: () => ipcRenderer.invoke('libreria:elenco'),
  leggiBrano: (nome) => ipcRenderer.invoke('libreria:leggi', nome),
  scriviBrano: (nome, testo, opzioni) => ipcRenderer.invoke('libreria:scrivi', nome, testo, opzioni),
  preferenze: () => ipcRenderer.invoke('preferenze:leggi'),
  salvaPreferenze: (modifiche) => ipcRenderer.invoke('preferenze:salva', modifiche),
  suPreferenze: (fn) => ipcRenderer.on('preferenze-cambiate', (_e, p) => fn(p)),
  aggiungiCartellaAbleton: () => ipcRenderer.invoke('ableton:aggiungi-cartella'),
  progettiAbleton: () => ipcRenderer.invoke('ableton:progetti'),
  crasha: (chi) => ipcRenderer.send('crasha', chi),
  uscitaOnOff: () => ipcRenderer.invoke('uscita:onoff'),
  uscitaSchermoIntero: () => ipcRenderer.invoke('uscita:schermo-intero'),
  uscitaAperta: () => ipcRenderer.invoke('uscita:aperta'),
  suUscita: (fn) => ipcRenderer.on('uscita-stato', (_e, aperta) => fn(aperta)),
  log: (nome, riga) => ipcRenderer.send('log', nome, riga),
  percorsoLog: () => ipcRenderer.invoke('log:percorso'),
});

// I canali diretti tra controllo, live e cuffia: il preload li passa alla pagina.
ipcRenderer.on('porta', (e, con) => window.postMessage({ porta: con }, '*', e.ports));
