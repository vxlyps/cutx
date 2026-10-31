// Spia MIDI per l'X-Touch Mini (e qualsiasi controller): elenca le porte e registra ogni messaggio che arriva, con i tasti da premere
// annunciati a voce (macOS `say`). Non è CUTX: dati a parte, non tocca niente.
//   node_modules/.bin/electron strumenti/midi-spia            → solo ascolto per 30 secondi
//   SPIA_GUIDA=1 node_modules/.bin/electron strumenti/midi-spia → giro guidato (circa 2 minuti e mezzo)
//   SPIA_LED=1 …                                               → prova di accensione di anelli e tasti
//   SPIA_MC=1 …                                                → mette il controller in modalità Mackie (MC) e ci resta; registra i gesti
//   SPIA_MCLED=1 …                                             → prova di LED in MC (anelli e tasti, quelli visti dal giro MC)
// Il registro è in $TMPDIR/cutx-midi-spia-<modo>.log (o SPIA_OUT).
const { app, BrowserWindow, session } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

app.setPath('userData', path.join(os.tmpdir(), 'cutx-midi-spia-dati'));
const MODO = process.env.SPIA_GUIDA ? 'guida' : process.env.SPIA_LED ? 'led' : process.env.SPIA_MC ? 'mc' : process.env.SPIA_MCLED ? 'mcled' : 'ascolto';
const OUT = process.env.SPIA_OUT || path.join(os.tmpdir(), `cutx-midi-spia-${MODO}.log`);
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
    // Modalità STANDARD, come dice la tabella RX della guida ufficiale: tutto sul canale globale (11). Tasti: nota-on con velocità
    // 0 spento, 1 acceso, 2 lampeggia (note 0–7 riga alta, 8–15 riga bassa, secondo il manuale). Anelli: CC 1–8 = comportamento
    // (0 singolo, 1 pan, 2 fan, 3 spread, 4 trim), CC 9–16 = valore (0 spento, 1–13 acceso, 14–26 lampeggia, 27 tutti, 28 tutti lampeggiano).
    const CH = 10; // canale 11
    const manda = (...b) => w.webContents.executeJavaScript(`manda(${b.join(',')})`);
    const note = (n, v) => manda(0x90 | CH, n, v);
    const cc = (n, v) => manda(0xb0 | CH, n, v);
    const gruppo = async (testo, da, a, vel, s = 2.5) => {
      await marca(testo);
      dillo(testo);
      for (let n = da; n <= a; n++) await note(n, vel);
      await aspetta(s);
      for (let n = da; n <= a; n++) await note(n, 0);
      await aspetta(0.8);
    };
    dillo('Prova dei led in modalità standard. Guarda il controller e ricordati cosa si accende.');
    await aspetta(4);
    for (const [t, da, a] of [['Gruppo uno: note da zero a sette', 0, 7], ['Gruppo due: note da otto a quindici', 8, 15], ['Gruppo tre: note da sedici a ventitré', 16, 23], ['Gruppo quattro: note da ventiquattro a trentuno', 24, 31]]) await gruppo(t, da, a, 1);
    await gruppo('Gruppo cinque: note da otto a quindici, lampeggiano', 8, 15, 2, 3.5);
    for (let k = 1; k <= 8; k++) await cc(k, 0); // comportamento singolo
    await marca('anelli: singolo, tutti a metà');
    dillo('Anelli: singolo, tutti a metà');
    for (let k = 9; k <= 16; k++) await cc(k, 7);
    await aspetta(3);
    const modi = ['singolo', 'pan', 'fan', 'spread', 'trim'];
    for (let m = 0; m < modi.length; m++) {
      await marca(`anello uno: ${modi[m]}`);
      dillo(`Anello uno: ${modi[m]}`);
      await cc(1, m);
      for (const v of [1, 4, 7, 10, 13]) {
        await cc(9, v);
        await aspetta(1.1);
      }
      await cc(9, 0);
      await aspetta(0.5);
    }
    await cc(1, 0);
    for (const [t, v] of [['anello uno: valore venti, lampeggia', 20], ['anello uno: tutti accesi', 27], ['anello uno: tutti lampeggiano', 28]]) {
      await marca(t);
      dillo(t);
      await cc(9, v);
      await aspetta(2.5);
    }
    await cc(9, 0);
    await marca('layer B (program change 1)');
    dillo('Cambio layer: B');
    await manda(0xc0 | CH, 1);
    await aspetta(3);
    await marca('layer A (program change 0)');
    dillo('Cambio layer: A');
    await manda(0xc0 | CH, 0);
    await aspetta(3);
    await marca('fine');
    dillo('Fatto. Dimmi cosa hai visto.');
    await aspetta(2);
  } else if (process.env.SPIA_MC) {
    // Modalità MACKIE (MC): si entra con CC 127 = 1 sul canale globale e ci si resta (il modo si ricorda anche dopo aver scollegato). Registra come si muovono
    // manopole, tasti e fader, e prova gli anelli alla maniera Mackie (CC 48–55 sul canale 1).
    const manda = (...b) => w.webContents.executeJavaScript(`manda(${b.join(',')})`);
    dillo('Passo alla modalità Mackie. Il led MC MODE si deve accendere.');
    await marca('passo in MC (CC 127 = 1, canale 11)');
    await manda(0xba, 127, 1);
    await aspetta(4);
    const GIRO_MC = [
      ['Manopola uno: gira a destra, piano', 6],
      ['Manopola uno: gira a sinistra', 6],
      ['Manopola uno: gira ancora a sinistra, più a lungo', 6],
      ['Manopola uno: premila e rilasciala', 5],
      ['Manopola otto: gira a destra, poi premila', 7],
      ['Tasto in alto a sinistra: premilo', 5],
      ['Tasto in alto a destra: premilo', 5],
      ['Tasto in basso a sinistra: premilo', 5],
      ['Tasto in basso a destra: premilo', 5],
      ['Premi i tasti, uno dopo l\'altro, riga alta da sinistra a destra', 12],
      ['Premi i tasti, uno dopo l\'altro, riga bassa da sinistra a destra', 12],
      ['Fader: sposta tutta la corsa, su e giù', 7],
      ['Premi il tasto layer A', 5],
      ['Premi il tasto layer B', 5],
    ];
    for (const [testo, secondi] of GIRO_MC) {
      await marca(testo);
      dillo(testo);
      await aspetta(secondi);
    }
    // anelli alla maniera Mackie: CC 0x30 + n sul canale 1; bit 0-3 posizione, bit 4-5 modo (0 punto, 1 pan, 2 fan, 3 spread)
    for (const [nome, vals] of [['punto', [1, 6, 11]], ['pan', [0x11, 0x16, 0x1b]], ['fan', [0x21, 0x26, 0x2b]], ['spread', [0x31, 0x36, 0x3b]]]) {
      await marca(`anello uno Mackie: ${nome}`);
      dillo(`Anello uno, ${nome}`);
      for (const v of vals) {
        await manda(0xb0, 0x30, v);
        await aspetta(1.2);
      }
      await manda(0xb0, 0x30, 0);
    }
    await marca('fine');
    dillo('Fatto. Il controller resta in modalità Mackie.');
    await aspetta(2);
  } else if (process.env.SPIA_MCLED) {
    // LED in modalità MC: i tasti con le note che il controller ha mandato nel giro MC (stesso numero per la risposta, come vuole Mackie),
    // gli anelli con CC 0x30 + n sul canale 1. Il controller resta in MC.
    const manda = (...b) => w.webContents.executeJavaScript(`manda(${b.join(',')})`);
    await manda(0xba, 127, 1); // se per caso fosse in standard, lo rimette in MC
    const log = fs.existsSync(path.join(os.tmpdir(), 'cutx-midi-spia-mc.log')) ? fs.readFileSync(path.join(os.tmpdir(), 'cutx-midi-spia-mc.log'), 'utf8').split('\n') : [];
    const note = new Map(); // nome del passo → note in ordine di arrivo
    let passo = null;
    for (const r of log) {
      if (r.startsWith('PASSO ')) {
        passo = r.slice(6);
        note.set(passo, []);
      } else if (passo) {
        const m = r.match(/^[\d.]+ ([0-9a-f]{2}) ([0-9a-f]{2}) ([0-9a-f]{2})$/);
        if (m && (parseInt(m[1], 16) & 0xf0) === 0x90 && parseInt(m[3], 16) > 0 && !note.get(passo).includes(parseInt(m[2], 16))) note.get(passo).push(parseInt(m[2], 16));
      }
    }
    const trova = (pezzo) => [...note].find(([k]) => k.includes(pezzo))?.[1] ?? [];
    const alte = trova('riga alta');
    const basse = trova('riga bassa');
    const altre = [['push manopola uno', trova('premila e rilasciala')], ['layer A', trova('layer A')], ['layer B', trova('layer B')]];
    scrivi(`NOTE riga alta: ${alte.join(',')} · riga bassa: ${basse.join(',')} · altre: ${altre.map(([n, v]) => `${n}=${v.join(',')}`).join(' ')}`);
    dillo('Prova dei led in modalità Mackie. Guarda il controller.');
    await aspetta(3);
    const accendi = async (testo, nn) => {
      await marca(testo);
      dillo(testo);
      for (const v of [127, 0]) {
        await manda(0x90, nn, v);
        await aspetta(v ? 1.6 : 0.6);
      }
    };
    if (alte.length || basse.length) {
      for (const [i, nn] of alte.entries()) await accendi(`Riga alta, tasto ${i + 1}, nota ${nn}`, nn);
      for (const [i, nn] of basse.entries()) await accendi(`Riga bassa, tasto ${i + 1}, nota ${nn}`, nn);
      for (const [nome, v] of altre) for (const nn of v) await accendi(`${nome}, nota ${nn}`, nn);
    } else {
      // nessun giro MC registrato: si prova a gruppi di otto note
      for (let n = 0; n < 104; n += 8) {
        await marca(`note da ${n} a ${n + 7}`);
        dillo(`Note da ${n} a ${n + 7}`);
        for (let k = n; k < n + 8; k++) await manda(0x90, k, 127);
        await aspetta(2);
        for (let k = n; k < n + 8; k++) await manda(0x90, k, 0);
        await aspetta(0.5);
      }
    }
    // anelli alla maniera Mackie
    for (const [nome, vals] of [['punto', [1, 6, 11]], ['pan', [0x11, 0x16, 0x1b]], ['fan', [0x21, 0x26, 0x2b]], ['spread', [0x31, 0x36, 0x3b]]]) {
      await marca(`anello uno: ${nome}`);
      dillo(`Anello uno, ${nome}`);
      for (const v of vals) {
        await manda(0xb0, 0x30, v);
        await aspetta(1.2);
      }
      await manda(0xb0, 0x30, 0);
    }
    await marca('tutti gli otto anelli, uno alla volta, punto al centro');
    dillo('Gli otto anelli, uno alla volta');
    for (let k = 0; k < 8; k++) {
      await manda(0xb0, 0x30 + k, 6);
      await aspetta(0.9);
      await manda(0xb0, 0x30 + k, 0);
    }
    await marca('fine');
    dillo('Fatto. Dimmi cosa si è acceso.');
    await aspetta(2);
  } else {
    await aspetta(Number(process.env.SPIA_S || 30));
  }
  app.quit();
});
