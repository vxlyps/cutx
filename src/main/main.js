// Processo principale: finestre, protocollo cutx://, permessi, motore cuffia.
import { app, BrowserWindow, protocol, net, ipcMain, dialog, session, MessageChannelMain } from 'electron';
import path from 'node:path';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as stash from './stash.js';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(QUI, '../../dist');
const PRELOAD = path.join(QUI, 'preload.cjs');
const ORIGINE = 'cutx://app';
const PERMESSI = new Set(['media', 'midi', 'midiSysex', 'speaker-selection']);
const ICONA = path.resolve(QUI, '../../risorse/icona/cutx.png');

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
migraDaDaneel();

app.on('second-instance', () => {
  if (controllo?.isMinimized()) controllo.restore();
  controllo?.focus();
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
  autoplayPolicy: 'no-user-gesture-required', // la cuffia è nascosta: non riceverà mai un clic
};

// I messaggi delle pagine finiscono anche nel terminale.
function inoltraConsole(wc, nome) {
  wc.on('console-message', (e) => {
    if (e.level !== 'debug') console.log(`[${nome}] ${e.message}`);
  });
}

let controllo = null;
let cuffia = null;
let pronti = { controllo: false, cuffia: false };

// Collega controllo e cuffia con un canale diretto, senza passare da qui per ogni evento.
function collega() {
  if (!pronti.controllo || !pronti.cuffia) return;
  const { port1, port2 } = new MessageChannelMain();
  controllo.webContents.postMessage('porta-cuffia', null, [port1]);
  cuffia.webContents.postMessage('porta-cuffia', null, [port2]);
}

function creaControllo() {
  controllo = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#000000',
    title: 'CUTX',
    webPreferences,
  });
  inoltraConsole(controllo.webContents, 'controllo');
  controllo.webContents.on('did-finish-load', () => {
    pronti.controllo = true;
    collega();
  });
  controllo.on('closed', () => app.quit());
  controllo.loadURL(`${ORIGINE}/index.html`);
}

// Il motore cuffia vive in un processo suo: se si blocca o crasha, il live non lo sente.
function creaCuffia() {
  pronti.cuffia = false;
  const finestra = new BrowserWindow({ show: false, webPreferences });
  cuffia = finestra;
  const attuale = () => cuffia === finestra;
  inoltraConsole(finestra.webContents, 'cuffia');
  finestra.webContents.on('did-finish-load', () => {
    if (!attuale()) return;
    pronti.cuffia = true;
    collega();
  });
  finestra.webContents.on('render-process-gone', (_e, dettagli) => {
    if (!attuale()) return;
    console.log(`[cuffia] processo terminato (${dettagli.reason}), riavvio`);
    riavviaCuffia();
  });
  finestra.on('unresponsive', () => {
    if (!attuale()) return;
    console.log('[cuffia] bloccata, riavvio');
    riavviaCuffia();
  });
  finestra.loadURL(`${ORIGINE}/motore.html`);
}

function riavviaCuffia() {
  const vecchia = cuffia;
  cuffia = null;
  if (vecchia && !vecchia.isDestroyed()) vecchia.destroy();
  if (controllo && !controllo.isDestroyed()) controllo.webContents.send('cuffia-riavvio');
  setTimeout(creaCuffia, 300);
}

ipcMain.handle('stash:stato', () => stash.stato());
ipcMain.handle('stash:scegli', async () => {
  const r = await dialog.showOpenDialog(controllo, {
    title: 'Scegli lo stash',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return stash.stato();
  await stash.imposta(r.filePaths[0]);
  return stash.stato();
});
ipcMain.handle('stash:salva', (_e, config) => stash.salvaConfig(config));
ipcMain.on('cuffia:crasha', () => cuffia?.webContents.forcefullyCrashRenderer());

const CARTELLA_LOG = () => path.join(app.getPath('userData'), 'log');
ipcMain.handle('log:percorso', () => CARTELLA_LOG());
ipcMain.on('log', async (_e, nome, riga) => {
  const file = path.join(CARTELLA_LOG(), path.basename(nome));
  await mkdir(CARTELLA_LOG(), { recursive: true });
  await appendFile(file, riga + '\n');
});

app.whenReady().then(async () => {
  app.dock?.setIcon(ICONA);
  stash.carica();
  protocol.handle('cutx', serviFile);
  const nostro = (url) => url?.startsWith(ORIGINE);
  session.defaultSession.setPermissionRequestHandler((wc, permesso, cb) =>
    cb(PERMESSI.has(permesso) && nostro(wc.getURL())),
  );
  session.defaultSession.setPermissionCheckHandler((_wc, permesso, origine) =>
    PERMESSI.has(permesso) && nostro(origine),
  );
  creaControllo();
  creaCuffia();
});
