// L'unica porta tra le finestre e il disco. Niente Node nelle pagine.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cutx', {
  stash: () => ipcRenderer.invoke('stash:stato'),
  scegliStash: () => ipcRenderer.invoke('stash:scegli'),
  rileggiStash: () => ipcRenderer.invoke('stash:rileggi'),
  salvaConfig: (config) => ipcRenderer.invoke('stash:salva', config),
  suStashCambiato: (fn) => ipcRenderer.on('stash-cambiato', () => fn()),
  durataSuono: (rel) => ipcRenderer.invoke('suoni:durata', rel),
  libreria: () => ipcRenderer.invoke('libreria:elenco'),
  leggiBrano: (nome) => ipcRenderer.invoke('libreria:leggi', nome),
  scriviBrano: (nome, testo, opzioni) => ipcRenderer.invoke('libreria:scrivi', nome, testo, opzioni),
  preferenze: () => ipcRenderer.invoke('preferenze:leggi'),
  salvaPreferenze: (modifiche) => ipcRenderer.invoke('preferenze:salva', modifiche),
  suPreferenze: (fn) => ipcRenderer.on('preferenze-cambiate', (_e, p) => fn(p)),
  aggiungiCartellaAbleton: () => ipcRenderer.invoke('ableton:aggiungi-cartella'),
  infoAbleton: (percorso) => ipcRenderer.invoke('ableton:info', percorso),
  modelloAbleton: (percorso) => ipcRenderer.invoke('ableton:modello', percorso),
  fileAbleton: (percorso, file) => ipcRenderer.invoke('ableton:file', percorso, file),
  scegliFileAbleton: (titolo) => ipcRenderer.invoke('ableton:scegli-file', titolo),
  importaAbleton: (richiesta) => ipcRenderer.invoke('ableton:importa', richiesta),
  progettiAbleton: () => ipcRenderer.invoke('ableton:progetti'),
  scegliImmagine: () => ipcRenderer.invoke('immagine:scegli'),
  leggiImmagine: (percorso) => ipcRenderer.invoke('immagine:leggi', percorso),
  crasha: (chi) => ipcRenderer.send('crasha', chi),
  uscitaOnOff: () => ipcRenderer.invoke('uscita:onoff'),
  uscitaSchermoIntero: () => ipcRenderer.invoke('uscita:schermo-intero'),
  uscitaAperta: () => ipcRenderer.invoke('uscita:aperta'),
  suUscita: (fn) => ipcRenderer.on('uscita-stato', (_e, aperta) => fn(aperta)),
  logEvento: (livello, fonte, testo) => ipcRenderer.send('log:evento', livello, fonte, testo),
  infoApp: () => ipcRenderer.invoke('app:info'),
  mostraLog: () => ipcRenderer.invoke('log:mostra'),
  log: (nome, riga) => ipcRenderer.send('log', nome, riga),
  percorsoLog: () => ipcRenderer.invoke('log:percorso'),
});

// I canali diretti tra controllo, live e cuffia: il preload li passa alla pagina.
ipcRenderer.on('porta', (e, con) => window.postMessage({ porta: con }, '*', e.ports));
