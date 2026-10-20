// Processo principale: finestre, protocollo cutx://, permessi, guardiano dei motori.
import { app, BrowserWindow, protocol, net, ipcMain, dialog, session, MessageChannelMain } from 'electron';
import path from 'node:path';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as stash from './stash.js';
import { prova, foto } from './prova.js';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(QUI, '../../dist');
const PRELOAD = path.join(QUI, 'preload.cjs');
const ORIGINE = 'cutx://app';
const PERMESSI = new Set(['media', 'midi', 'midiSysex', 'speaker-selection']);
const ICONA = path.resolve(QUI, '../../risorse/icona/cutx.png');
const PROVA = process.argv.includes('--prova'); // prova automatica di robustezza
const FOTO = process.argv.find((a) => a.startsWith('--foto='))?.slice('--foto='.length); // foto della postazione

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
  const controllo = finestre.controllo;
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
  autoplayPolicy: 'no-user-gesture-required', // i motori sono nascosti: non riceveranno mai un clic
};

// I messaggi delle pagine finiscono anche nel terminale.
function inoltraConsole(wc, nome) {
  wc.on('console-message', (e) => {
    if (e.level !== 'debug') console.log(`[${nome}] ${e.message}`);
  });
}

// Tre finestre, tre processi: controllo (l'interfaccia), live e cuffia (motori nascosti).
const finestre = { controllo: null, live: null, cuffia: null };
const pronte = { controllo: false, live: false, cuffia: false };
const COPPIE = [
  ['controllo', 'live'],
  ['controllo', 'cuffia'],
  ['live', 'cuffia'],
];

// Collega una finestra appena (ri)caricata alle altre con canali diretti, senza passare da qui.
function collega(nome) {
  for (const [a, b] of COPPIE) {
    if (a !== nome && b !== nome) continue;
    if (!pronte[a] || !pronte[b]) continue;
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
    console.log(`[controllo] processo terminato (${dettagli.reason}), ricarico`);
    setTimeout(() => !finestra.isDestroyed() && finestra.webContents.reload(), 300);
  });
  finestra.on('unresponsive', () => console.log('[controllo] bloccata (i motori continuano)'));
  finestra.on('responsive', () => console.log('[controllo] di nuovo viva'));
  finestra.on('closed', () => app.quit());
  finestra.loadURL(`${ORIGINE}/index.html`);
}

// Ogni motore vive in un processo suo: se uno si blocca o crasha, gli altri non lo sentono.
function creaMotore(ruolo) {
  pronte[ruolo] = false;
  const finestra = new BrowserWindow({ show: false, webPreferences });
  finestre[ruolo] = finestra;
  const attuale = seguiCaricamento(ruolo, finestra);
  finestra.webContents.on('render-process-gone', (_e, dettagli) => {
    if (!attuale()) return;
    console.log(`[${ruolo}] processo terminato (${dettagli.reason}), riavvio`);
    riavviaMotore(ruolo);
  });
  // La cuffia bloccata si riavvia. Il live non si tocca mai: meglio aspettarlo che ucciderlo.
  finestra.on('unresponsive', () => {
    if (!attuale()) return;
    console.log(`[${ruolo}] bloccato`);
    if (ruolo === 'cuffia') riavviaMotore(ruolo);
  });
  finestra.loadURL(`${ORIGINE}/motore.html?ruolo=${ruolo}`);
}

function riavviaMotore(ruolo) {
  const vecchia = finestre[ruolo];
  finestre[ruolo] = null;
  pronte[ruolo] = false;
  if (vecchia && !vecchia.isDestroyed()) vecchia.destroy();
  setTimeout(() => creaMotore(ruolo), 300);
}

function avvisaMotori() {
  for (const ruolo of ['live', 'cuffia']) {
    const wc = finestre[ruolo]?.webContents;
    if (wc && !wc.isDestroyed()) wc.send('stash-cambiato');
  }
}

ipcMain.handle('stash:stato', () => stash.stato());
ipcMain.handle('stash:scegli', async () => {
  const r = await dialog.showOpenDialog(finestre.controllo, {
    title: 'Scegli lo stash',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return stash.stato();
  await stash.imposta(r.filePaths[0]);
  avvisaMotori();
  return stash.stato();
});
ipcMain.handle('stash:salva', async (_e, config) => {
  await stash.salvaConfig(config);
  avvisaMotori();
});
// Solo per i test di robustezza.
ipcMain.on('crasha', (_e, chi) => finestre[chi]?.webContents.forcefullyCrashRenderer());

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
  creaMotore('live');
  creaMotore('cuffia');
  creaControllo();
  if (PROVA) prova({ finestre, cartellaLog: CARTELLA_LOG() }).then((ok) => app.exit(ok ? 0 : 1));
  if (FOTO) foto({ finestre, file: FOTO }).then(() => app.exit(0));
});
