// Spia MIDI per l'X-Touch Mini (e qualsiasi controller): elenca le porte e registra ogni messaggio che arriva, con i tasti da premere
// annunciati a voce (macOS `say`). Non è CUTX: dati a parte, non tocca niente.
//   node_modules/.bin/electron strumenti/midi-spia            → solo ascolto per 30 secondi
//   SPIA_GUIDA=1 node_modules/.bin/electron strumenti/midi-spia → giro guidato (circa 2 minuti e mezzo)
//   SPIA_LED=1 …                                               → prova di accensione di anelli e tasti
// Il registro è in $TMPDIR/cutx-midi-spia.log (o SPIA_OUT).
const { app, BrowserWindow, session } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

app.setPath('userData', path.join(os.tmpdir(), 'cutx-midi-spia-dati'));
const OUT = process.env.SPIA_OUT || path.join(os.tmpdir(), 'cutx-midi-spia.log');
fs.writeFileSync(OUT, '');
const scrivi = (r) => {
  fs.appendFileSync(OUT, `${r}\n`);
  console.log(r);
};
const dillo = (testo) => execFile('say', ['-v', 'Alice', testo], () => {});
const aspetta = (s) => new Promise((r) => setTimeout(r, s * 1000));

const GUIDA = [
  ['Manopola uno: gira a destra, piano', 7],
  ['Manopola uno: gira a sinistra', 7],
  ['Manopola uno: premila e rilasciala, una volta', 6],
  ['Manopola due: gira a destra, poi premila una volta', 8],
  ['Manopola otto: gira a destra, poi premila una volta', 8],
  ['Tasto in alto a sinistra: premilo una volta', 6],
  ['Tasto in alto a destra: premilo una volta', 6],
  ['Tasto in basso a sinistra: premilo una volta', 6],
  ['Tasto in basso a destra: premilo una volta', 6],
  ['Fader: sposta tutta la corsa, su e giù', 8],
  ['Premi il tasto layer B, e basta', 6],
  ['Layer B: manopola uno gira a destra, poi premila', 8],
  ['Layer B: tasto in alto a sinistra, poi tasto in basso a destra', 8],
  ['Layer B: muovi il fader', 7],
  ['Premi il tasto layer A, e basta', 6],
];

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_wc, p, cb) => cb(['midi', 'midiSysex'].includes(p)));
  session.defaultSession.setPermissionCheckHandler((_wc, p) => ['midi', 'midiSysex'].includes(p));
  const w = new BrowserWindow({ show: false });
  w.webContents.on('console-message', (_e, _l, m) => scrivi(m));
  await w.loadFile(path.join(__dirname, 'pagina.html'));
  await w.webContents.executeJavaScript(`(async () => {
    const t0 = performance.now();
    const acc = await navigator.requestMIDIAccess({ sysex: true });
    globalThis.acc = acc;
    const nome = (p) => p.name + ' | ' + p.manufacturer + ' | ' + p.id;
    for (const i of acc.inputs.values()) console.log('INGRESSO ' + nome(i));
    for (const o of acc.outputs.values()) console.log('USCITA ' + nome(o));
    for (const i of acc.inputs.values()) i.onmidimessage = (e) => console.log(((performance.now() - t0) / 1000).toFixed(3) + ' ' + [...e.data].map((b) => b.toString(16).padStart(2, '0')).join(' '));
    acc.onstatechange = (e) => console.log('STATO ' + e.port.name + ' ' + e.port.state);
    globalThis.manda = (...byte) => { for (const o of acc.outputs.values()) o.send(byte); };
    // chi sei? (identity request): la risposta arriva come messaggio sysex
    globalThis.manda(0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7);
  })()`);
  const marca = (t) => w.webContents.executeJavaScript(`console.log(${JSON.stringify(`PASSO ${t}`)})`);
  if (process.env.SPIA_GUIDA) {
    dillo('Comincio. Hai qualche secondo per ogni gesto.');
    await aspetta(5);
    for (const [testo, secondi] of GUIDA) {
      await marca(testo);
      dillo(testo);
      await aspetta(secondi);
    }
    await marca('fine');
    dillo('Fatto, grazie.');
    await aspetta(2);
  } else if (process.env.SPIA_LED) {
    const manda = (...b) => w.webContents.executeJavaScript(`manda(${b.join(',')})`);
    // tasti: nota 8..23 (layer A) con velocità 0, 1, 127; anelli: CC 1..8 con valori diversi
    await marca('LED tasto 8 acceso (velocità 127)');
    dillo('Provo i tasti e gli anelli. Guarda cosa si accende.');
    await manda(0x90, 8, 127);
    await aspetta(2);
    await marca('LED tasto 8 lampeggia (velocità 1)');
    await manda(0x90, 8, 1);
    await aspetta(2);
    await manda(0x90, 8, 0);
    for (const [nome, valori] of [
      ['anello 1 valori 1..13', [1, 4, 7, 10, 13]],
      ['anello 1 valori 17..27', [17, 20, 23, 27]],
      ['anello 1 valori 33..43', [33, 36, 40, 43]],
      ['anello 1 valori 49..61', [49, 52, 56, 61]],
      ['anello 1 valori 65..77', [65, 70, 77]],
      ['anello 1 valori 81..127', [81, 100, 127]],
    ]) {
      await marca(nome);
      dillo(nome.replace('..', ' a '));
      for (const v of valori) {
        await manda(0xb0, 1, v);
        await aspetta(1.2);
      }
      await manda(0xb0, 1, 0);
    }
    await marca('fine');
  } else {
    await aspetta(Number(process.env.SPIA_S || 30));
  }
  app.quit();
});
