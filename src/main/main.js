// Processo principale: finestre, protocollo cutx://, permessi, guardiano dei motori.
import { app, BrowserWindow, Menu, protocol, net, ipcMain, dialog, screen, session, shell, MessageChannelMain } from 'electron';
import path from 'node:path';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as stash from './stash.js';
import * as preferenze from './preferenze.js';
import { consentito, trovaProgetti } from '../ableton/scansione.js';
import * as ableton from './ableton.js';
import * as log from './log.js';
import { prova, foto, schermate } from './prova.js';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(QUI, '../../dist');
const PRELOAD = path.join(QUI, 'preload.cjs');
const ORIGINE = 'cutx://app';
const PERMESSI = new Set(['media', 'midi', 'midiSysex', 'speaker-selection']);
const ICONA = path.resolve(QUI, '../../risorse/icona/cutx.png');
// prova automatica: --prova (tutto), --prova=robustezza, --prova=brani
const PROVA = process.argv.find((a) => a === '--prova' || a.startsWith('--prova='))?.split('=')[1] ?? (process.argv.includes('--prova') ? 'robustezza,brani,entrata,livelli,browser,impostazioni,ableton,neon,tempo,solidita,uscita' : null);
const SCHERMATE = process.argv.find((a) => a.startsWith('--schermate='))?.slice('--schermate='.length); // giro di tutti i pannelli a più dimensioni
const FOTO = process.argv.find((a) => a.startsWith('--foto='))?.slice('--foto='.length); // foto della postazione
const CHIUSURA = process.argv.find((a) => a.startsWith('--chiusura='))?.slice('--chiusura='.length); // prova: si apre e si chiude in un certo modo

// Prova e foto girano con dati a parte, accanto a una CUTX eventualmente aperta e senza toccarne le impostazioni.
if (PROVA || FOTO || SCHERMATE || CHIUSURA) {
  const dati = path.join(app.getPath('appData'), CHIUSURA ? 'CUTX-chiusura' : 'CUTX-prova');
  app.setPath('userData', dati);
  const impostazioni = path.join(dati, 'impostazioni.json');
  if (!existsSync(impostazioni)) {
    mkdirSync(dati, { recursive: true });
    writeFileSync(impostazioni, JSON.stringify({ stash: path.join(app.getPath('home'), 'Progetti', 'cutx-stash-test') }));
  }
}

// Una sola CUTX alla volta: due motori live sulla stessa scheda sarebbero un disastro.
if (!app.requestSingleInstanceLock()) app.exit(0);

// CUTX si chiamava DANEEL: al primo avvio impostazioni e log passano alla cartella nuova.
function migraDaDaneel() {
  const sposta = (da, a) => {
    if (!existsSync(da) || existsSync(a)) return;
    mkdirSync(path.dirname(a), { recursive: true });
    renameSync(da, a);
  };
  const vecchiDati = path.join(app.getPath('appData'), 'daneel');
  for (const nome of ['impostazioni.json', 'log']) sposta(path.join(vecchiDati, nome), path.join(app.getPath('userData'), nome));
  const vecchiLog = path.join(path.dirname(app.getPath('logs')), 'DANEEL', 'avvio.log');
  sposta(vecchiLog, path.join(app.getPath('logs'), 'avvio-daneel.log'));
}
if (!PROVA && !FOTO && !SCHERMATE && !CHIUSURA) migraDaDaneel();

// Il registro: errori e avvisi di tutti i processi, in ~/Library/Logs/CUTX (nelle prove, in una cartella a parte).
const PER_PROVE = !!(PROVA || FOTO || SCHERMATE || CHIUSURA);
log.inizia(PER_PROVE ? path.join(app.getPath('userData'), 'log') : app.getPath('logs'));
// Un evento del guardiano o dell'app: nel terminale e nel registro.
const ev = (livello, fonte, testo) => {
  console.log(`[${fonte}] ${testo}`);
  log.scrivi(livello, fonte, testo);
};
// Un errore non gestito non deve far comparire finestre né fermare l'app: si scrive e si va avanti.
process.on('uncaughtException', (e) => log.scrivi('errore', 'main', `eccezione non gestita: ${e?.stack ?? e}`));
process.on('unhandledRejection', (e) => log.scrivi('errore', 'main', `promessa rifiutata: ${e?.stack ?? e}`));
// Chiudere da fuori (kill, spegnimento, Terminale) chiude CUTX come ⌘Q.
for (const segnale of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(segnale, () => app.quit());
app.on('child-process-gone', (_e, d) => ev('errore', 'processo', `${d.type} terminato (${d.reason}, codice ${d.exitCode})`));

let chiudendo = false; // l'app sta chiudendo: niente più riavvii né messaggi alle finestre
app.on('before-quit', () => (chiudendo = true));
const viva = (f) => !!f && !f.isDestroyed();
// Il contenuto web di una finestra, se esiste ancora (una finestra chiusa non si tocca).
const wcDi = (nome) => (viva(finestre[nome]) ? finestre[nome].webContents : null);
const padre = () => (viva(finestre.controllo) ? finestre.controllo : undefined);

app.on('second-instance', () => {
  const controllo = finestre.controllo;
  if (!viva(controllo)) return;
  if (controllo.isMinimized()) controllo.restore();
  controllo.focus();
});

// cutx:// deve essere un contesto sicuro: setSinkId, Web MIDI e getUserMedia funzionano solo lì.
protocol.registerSchemesAsPrivileged([
  { scheme: 'cutx', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// Risolve rel dentro radice; null se prova a uscirne.
function dentro(radice, rel) {
  const p = path.resolve(radice, rel);
  return p === radice || p.startsWith(radice + path.sep) ? p : null;
}

function serviFile(req) {
  const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
  let file;
  if (rel.startsWith('stash/')) {
    const radice = stash.radice();
    file = radice && dentro(radice, rel.slice('stash/'.length));
  } else if (rel.startsWith('anteprima/')) {
    // un file audio di un progetto Ableton, per sentirlo in cuffia prima di importarlo
    file = ableton.percorsoAnteprima(rel.slice('anteprima/'.length));
  } else {
    file = dentro(DIST, rel || 'index.html');
  }
  if (!file) return new Response('vietato', { status: 403 });
  return net.fetch(pathToFileURL(file).toString()).catch(() => new Response('non trovato', { status: 404 }));
}

const webPreferences = {
  preload: PRELOAD,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  backgroundThrottling: false, // niente rallentamenti quando la finestra non è in primo piano
  autoplayPolicy: 'no-user-gesture-required', // i motori sono nascosti: non riceveranno mai un clic
};

// I messaggi delle pagine finiscono anche nel terminale.
function inoltraConsole(wc, nome) {
  wc.on('console-message', (e) => {
    if (e.level !== 'debug') console.log(`[${nome}] ${e.message}`);
    // errori e avvisi di ogni pagina vanno nel registro (tranne il rumore noto di Electron)
    if ((e.level === 'error' || e.level === 'warning') && !/Electron Security Warning|Insecure Content-Security-Policy|^%cElectron/.test(e.message)) {
      log.scrivi(e.level === 'error' ? 'errore' : 'avviso', nome, e.message);
    }
  });
}

// Tre finestre, tre processi: controllo (l'interfaccia), live e cuffia (motori nascosti).
// Più, quando è aperta, l'uscita: quello che vede il pubblico.
const finestre = { controllo: null, live: null, cuffia: null, uscita: null };
const pronte = { controllo: false, live: false, cuffia: false, uscita: false };
const COPPIE = [
  ['controllo', 'live'],
  ['controllo', 'cuffia'],
  ['live', 'cuffia'],
  ['live', 'uscita'],
  ['controllo', 'uscita'],
];

// Collega una finestra appena (ri)caricata alle altre con canali diretti, senza passare da qui.
function collega(nome) {
  for (const [a, b] of COPPIE) {
    if (a !== nome && b !== nome) continue;
    if (!pronte[a] || !pronte[b] || !viva(finestre[a]) || !viva(finestre[b])) continue;
    const { port1, port2 } = new MessageChannelMain();
    finestre[a].webContents.postMessage('porta', b, [port1]);
    finestre[b].webContents.postMessage('porta', a, [port2]);
  }
}

function seguiCaricamento(nome, finestra) {
  const attuale = () => finestre[nome] === finestra;
  inoltraConsole(finestra.webContents, nome);
  finestra.webContents.on('did-finish-load', () => {
    if (!attuale()) return;
    pronte[nome] = true;
    console.log(`[${nome}] pronto, processo ${finestra.webContents.getOSProcessId()}`);
    collega(nome);
  });
  return attuale;
}

function creaControllo() {
  const finestra = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 640,
    backgroundColor: '#000000',
    title: 'CUTX',
    webPreferences,
  });
  finestre.controllo = finestra;
  seguiCaricamento('controllo', finestra);
  // Se l'interfaccia crasha la ricarico: i motori non se ne accorgono e lei riprende da loro.
  finestra.webContents.on('render-process-gone', (_e, dettagli) => {
    pronte.controllo = false;
    ev('errore', 'controllo', `processo terminato (${dettagli.reason}), ricarico`);
    setTimeout(() => !chiudendo && viva(finestra) && finestra.webContents.reload(), 300);
  });
  finestra.on('unresponsive', () => ev('avviso', 'controllo', 'bloccata (i motori continuano)'));
  finestra.on('responsive', () => ev('info', 'controllo', 'di nuovo viva'));
  finestra.on('closed', () => {
    // chiusa lei, si chiude tutto, in qualsiasi ordine: si smette subito di parlare con le altre finestre
    if (finestre.controllo === finestra) finestre.controllo = null;
    pronte.controllo = false;
    app.quit();
  });
  finestra.loadURL(`${ORIGINE}/index.html`);
}

// Ogni motore vive in un processo suo: se uno si blocca o crasha, gli altri non lo sentono.
function creaMotore(ruolo) {
  if (chiudendo) return;
  pronte[ruolo] = false;
  const finestra = new BrowserWindow({ show: false, webPreferences });
  finestre[ruolo] = finestra;
  const attuale = seguiCaricamento(ruolo, finestra);
  finestra.webContents.on('render-process-gone', (_e, dettagli) => {
    if (!attuale() || chiudendo) return;
    ev('errore', ruolo, `processo terminato (${dettagli.reason}), riavvio`);
    riavviaMotore(ruolo);
  });
  // La cuffia bloccata si riavvia. Il live non si tocca mai: meglio aspettarlo che ucciderlo.
  finestra.on('unresponsive', () => {
    if (!attuale()) return;
    ev('avviso', ruolo, ruolo === 'cuffia' ? 'bloccato, lo riavvio' : 'bloccato: lo aspetto (il live non si riavvia da solo mentre risponde)');
    if (ruolo === 'cuffia') riavviaMotore(ruolo);
  });
  finestra.on('responsive', () => attuale() && ev('info', ruolo, 'di nuovo vivo'));
  finestra.on('closed', () => {
    if (finestre[ruolo] === finestra) finestre[ruolo] = null;
    pronte[ruolo] = false;
  });
  finestra.loadURL(`${ORIGINE}/motore.html?ruolo=${ruolo}`);
}

function riavviaMotore(ruolo) {
  if (chiudendo) return;
  const vecchia = finestre[ruolo];
  finestre[ruolo] = null;
  pronte[ruolo] = false;
  if (viva(vecchia)) vecchia.destroy();
  setTimeout(() => creaMotore(ruolo), 300);
}

// --- la finestra di uscita ---
// Una finestra normale: la sposto dove voglio, ⌃⌘F la mette a schermo intero sullo schermo in cui
// sta. CUTX ricorda schermo, posizione e modalità. Se si chiude o crasha, i motori non lo sentono.

// Solo se la posizione salvata cade ancora su uno schermo collegato.
function bordiValidi(b) {
  if (!b) return null;
  const visibile = screen.getAllDisplays().some(({ workArea: w }) => b.x < w.x + w.width - 40 && b.x + b.width > w.x + 40 && b.y < w.y + w.height - 40 && b.y + b.height > w.y);
  return visibile ? b : null;
}

function avvisaUscita() {
  wcDi('controllo')?.send('uscita-stato', viva(finestre.uscita));
}

function creaUscita() {
  if (chiudendo) return;
  if (viva(finestre.uscita)) return finestre.uscita.focus();
  const ricordo = preferenze.leggi().uscita ?? {};
  const bordi = bordiValidi(ricordo.bordi);
  const finestra = new BrowserWindow({
    ...(bordi ?? { width: 1280, height: 720 }),
    backgroundColor: '#050604',
    title: 'CUTX · uscita',
    show: false,
    webPreferences,
  });
  // Si apre senza prendere il fuoco: le mani restano sulla postazione.
  finestra.once('ready-to-show', () => finestra.showInactive());
  finestre.uscita = finestra;
  pronte.uscita = false;
  seguiCaricamento('uscita', finestra);
  let bordiNormali = finestra.getBounds();
  let timer = null;
  const ricorda = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (finestra.isDestroyed()) return;
      const intero = finestra.isFullScreen();
      if (!intero) bordiNormali = finestra.getBounds();
      preferenze.salva({ uscita: { aperta: true, bordi: bordiNormali, schermoIntero: intero } });
    }, 400);
  };
  for (const evento of ['move', 'resize', 'enter-full-screen', 'leave-full-screen']) finestra.on(evento, ricorda);
  finestra.webContents.on('render-process-gone', (_e, dettagli) => {
    pronte.uscita = false;
    ev('errore', 'uscita', `processo terminato (${dettagli.reason}), ricarico`);
    setTimeout(() => !chiudendo && viva(finestra) && finestra.webContents.reload(), 300);
  });
  finestra.on('closed', () => {
    if (finestre.uscita === finestra) finestre.uscita = null;
    pronte.uscita = false;
    clearTimeout(timer);
    // chiudere CUTX con l'uscita aperta la ricorda aperta
    if (!chiudendo) preferenze.salva({ uscita: { ...preferenze.leggi().uscita, aperta: false } });
    avvisaUscita();
  });
  if (ricordo.schermoIntero) finestra.once('ready-to-show', () => finestra.setFullScreen(true));
  finestra.loadURL(`${ORIGINE}/uscita.html`);
  preferenze.salva({ uscita: { ...ricordo, aperta: true } });
  avvisaUscita();
}

ipcMain.handle('uscita:onoff', () => {
  if (viva(finestre.uscita)) finestre.uscita.close();
  else creaUscita();
  return viva(finestre.uscita);
});
ipcMain.handle('uscita:schermo-intero', () => {
  if (!viva(finestre.uscita)) creaUscita();
  const f = finestre.uscita;
  if (!viva(f)) return;
  if (f.webContents.isLoading()) f.once('ready-to-show', () => f.setFullScreen(true));
  else f.setFullScreen(!f.isFullScreen());
});
ipcMain.handle('uscita:aperta', () => viva(finestre.uscita));
// Solo per i test.
ipcMain.on('uscita:crasha', () => wcDi('uscita')?.forcefullyCrashRenderer());

function avvisaMotori() {
  for (const ruolo of ['live', 'cuffia']) {
    wcDi(ruolo)?.send('stash-cambiato');
  }
}

ipcMain.handle('stash:stato', () => stash.stato());
// La durata di un suono dello stash, se si può leggere dall'intestazione (WAV): per far tornare ▶ da solo a fine ascolto.
ipcMain.handle('suoni:durata', async (_e, rel) => {
  const radice = stash.radice();
  const file = radice && dentro(path.join(radice, 'suoni'), decodeURIComponent(String(rel)));
  try {
    return file ? await ableton.durataWav(file) : null;
  } catch {
    return null;
  }
});
ipcMain.handle('libreria:elenco', () => stash.elencoLibreria());
ipcMain.handle('libreria:leggi', (_e, nome) => stash.leggiBrano(nome));
ipcMain.handle('libreria:scrivi', (_e, nome, testo, opzioni) => stash.scriviBrano(nome, testo, opzioni));
ipcMain.handle('preferenze:leggi', () => preferenze.leggi());
ipcMain.handle('preferenze:salva', async (_e, modifiche) => {
  const nuove = await preferenze.salva(modifiche);
  for (const f of Object.values(finestre)) if (f && !f.isDestroyed()) f.webContents.send('preferenze-cambiate', nuove);
  return nuove;
});
// --- Ableton: le cartelle dei progetti (solo lette) ---
async function salvaPreferenze(modifiche) {
  const nuove = await preferenze.salva(modifiche);
  for (const f of Object.values(finestre)) if (f && !f.isDestroyed()) f.webContents.send('preferenze-cambiate', nuove);
  return nuove;
}
ipcMain.handle('ableton:aggiungi-cartella', async () => {
  const r = await dialog.showOpenDialog(padre(), {
    title: 'Dove tieni i progetti Ableton?',
    message: 'Scegli una cartella con dei progetti .als, o la cartella che li contiene tutti. CUTX li legge soltanto.',
    properties: ['openDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return preferenze.leggi();
  const attuali = preferenze.leggi().cartelleAbleton ?? [];
  return salvaPreferenze({ cartelleAbleton: [...new Set([...attuali, r.filePaths[0]])] });
});
ipcMain.handle('ableton:progetti', () => trovaProgetti(preferenze.leggi().cartelleAbleton ?? []));
ipcMain.handle('ableton:info', (_e, percorso) => ableton.info(percorso, preferenze.leggi().cartelleAbleton ?? []));
ipcMain.handle('ableton:file', async (_e, percorso, file) => {
  const cartelle = preferenze.leggi().cartelleAbleton ?? [];
  if (!consentito(percorso, cartelle)) return { errore: 'progetto fuori dalle cartelle scelte' };
  return { file: await ableton.risolviFile(path.dirname(percorso), file) };
});
// Cerca a mano un file audio (un file mancante, o lo stem di una traccia MIDI).
ipcMain.handle('ableton:scegli-file', async (_e, titolo) => {
  const r = await dialog.showOpenDialog(padre(), {
    title: titolo || 'Scegli il file audio',
    properties: ['openFile'],
    filters: [{ name: 'Audio', extensions: ['wav', 'aif', 'aiff', 'mp3', 'flac', 'ogg', 'm4a'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const f = await ableton.fileScelto(r.filePaths[0]);
  return f.errore ? f : { ...f, durata: await ableton.durataWav(f.percorso) };
});
// Importa: scrive il brano nella libreria dello stash e copia i suoni che servono. Se il brano c'è già
// non lo tocca (ritorna { esiste }): sovrascrive solo se gli si dice di sì.
ipcMain.handle('ableton:importa', async (_e, { file, testo, suoni, sovrascrivi }) => {
  const radice = stash.radice();
  if (!radice) return { errore: 'nessuno stash: sceglilo nella barra in alto' };
  try {
    const scritto = await stash.scriviBrano(file, testo, { sovrascrivi: !!sovrascrivi });
    if (scritto.esiste) return { esiste: true, file: scritto.file };
    const copie = await ableton.copiaSuoni(radice, suoni);
    avvisaMotori();
    return { file: scritto.file, ...copie };
  } catch (e) {
    return { errore: String(e.message ?? e) };
  }
});
ipcMain.handle('ableton:modello', async (_e, percorso) => {
  try {
    return { modello: await ableton.modello(percorso, preferenze.leggi().cartelleAbleton ?? []) };
  } catch (e) {
    return { errore: String(e.message ?? e) };
  }
});

ipcMain.handle('stash:scegli', async () => {
  const r = await dialog.showOpenDialog(padre(), {
    title: 'Scegli lo stash',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return stash.stato();
  await stash.imposta(r.filePaths[0]);
  avvisaMotori();
  return stash.stato();
});
ipcMain.handle('stash:rileggi', () => avvisaMotori()); // lo stash è tornato: i motori rileggono suoni e uscite
ipcMain.handle('stash:salva', async (_e, config) => {
  await stash.salvaConfig(config);
  avvisaMotori();
});
// Solo per i test di robustezza.
ipcMain.on('crasha', (_e, chi) => wcDi(chi)?.forcefullyCrashRenderer());

// Il registro (log.js) e le informazioni dell'app, per le impostazioni.
ipcMain.on('log:evento', (_e, livello, fonte, testo) => {
  log.scrivi(['info', 'avviso', 'errore'].includes(livello) ? livello : 'info', String(fonte).slice(0, 30), String(testo).slice(0, 4000));
});
ipcMain.handle('app:info', () => ({
  versione: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  sistema: `${process.platform} ${process.arch}`,
  registro: log.fileDelLog(),
}));
ipcMain.handle('log:mostra', () => {
  const file = log.fileDelLog();
  if (file) shell.showItemInFolder(file);
});

const CARTELLA_LOG = () => path.join(app.getPath('userData'), 'log');
ipcMain.handle('log:percorso', () => CARTELLA_LOG());
ipcMain.on('log', async (_e, nome, riga) => {
  const file = path.join(CARTELLA_LOG(), path.basename(nome));
  await mkdir(CARTELLA_LOG(), { recursive: true });
  await appendFile(file, riga + '\n');
});

// Menu nostro: quello predefinito di Electron si prende tasti che servono a CUTX (⌘0, ⌘R…).
function creaMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { label: 'Sviluppo', submenu: [{ role: 'toggleDevTools' }] },
      { role: 'windowMenu' },
    ]),
  );
}

// Solo per la prova di chiusura: apre l'app e la chiude in un certo modo. Chiudere deve essere pulito in qualsiasi ordine:
// niente errori, uscita con codice 0 e nessun processo rimasto acceso (lo controlla test/app/chiusura.test.js).
async function provaChiusura(modo) {
  const aspetta = (ms) => new Promise((r) => setTimeout(r, ms));
  const finche = async (fn, ms = 20000) => {
    for (const t = Date.now(); Date.now() - t < ms; await aspetta(100)) if (fn()) return true;
    return false;
  };
  setTimeout(() => {
    console.log('CHIUSURA-BLOCCATA');
    app.exit(2);
  }, 45000);
  if (!(await finche(() => pronte.controllo && pronte.live && pronte.cuffia))) {
    console.log('CHIUSURA-NONPRONTA');
    return app.exit(3);
  }
  await aspetta(1500);
  console.log('CHIUSURA-PRONTA');
  const conUscita = async () => {
    creaUscita();
    await finche(() => pronte.uscita);
    await aspetta(500);
  };
  switch (modo) {
    case 'controllo':
      return finestre.controllo.close();
    case 'uscita-prima':
      await conUscita();
      finestre.uscita.close();
      await aspetta(500);
      return finestre.controllo.close();
    case 'controllo-con-uscita':
      await conUscita();
      return finestre.controllo.close();
    case 'tutte-insieme':
      await conUscita();
      finestre.uscita.close();
      return finestre.controllo.close();
    case 'quit':
      await conUscita();
      return app.quit();
    case 'quit-subito':
      return app.quit();
    case 'crash-cuffia':
    case 'crash-live':
    case 'crash-controllo':
      wcDi(modo.replace('crash-', ''))?.forcefullyCrashRenderer();
      await aspetta(100);
      return viva(finestre.controllo) ? finestre.controllo.close() : app.quit();
    case 'attesa': // la chiude da fuori il test (SIGTERM)
      return undefined;
    default:
      console.log(`CHIUSURA-MODO-SCONOSCIUTO ${modo}`);
      return app.exit(4);
  }
}

app.on('window-all-closed', () => app.quit());

app.whenReady().then(async () => {
  app.dock?.setIcon(ICONA);
  ev('info', 'avvio', `CUTX ${app.getVersion()} · Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · ${process.platform} ${process.arch}${PER_PROVE ? ' · prova' : ''}`);
  creaMenu();
  stash.carica();
  stash.stato().then((st) => ev(st.mancante ? 'avviso' : 'info', 'avvio', st.percorso ? `stash: ${st.percorso}${st.mancante ? ' — NON COLLEGATO' : ''}` : 'nessuno stash scelto'), () => {});
  protocol.handle('cutx', serviFile);
  const nostro = (url) => url?.startsWith(ORIGINE);
  session.defaultSession.setPermissionRequestHandler((wc, permesso, cb) =>
    cb(PERMESSI.has(permesso) && nostro(wc.getURL())),
  );
  session.defaultSession.setPermissionCheckHandler((_wc, permesso, origine) =>
    PERMESSI.has(permesso) && nostro(origine),
  );
  creaMotore('live');
  creaMotore('cuffia');
  creaControllo();
  if (preferenze.leggi().uscita?.aperta) creaUscita();
  if (PROVA) prova({ finestre, cartellaLog: CARTELLA_LOG(), parti: PROVA.split(',') }).then((ok) => app.exit(ok ? 0 : 1));
  if (FOTO) foto({ finestre, file: FOTO }).then(() => app.exit(0));
  if (SCHERMATE) schermate({ finestre, cartella: path.resolve(SCHERMATE) }).then((n) => app.exit(n ? 1 : 0));
  if (CHIUSURA) provaChiusura(CHIUSURA);
});
