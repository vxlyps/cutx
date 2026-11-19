// Collaudo della REGIA (Korg nanoKONTROL2) per il paradigma CANALI, fase 0. Non è CUTX: dati a parte, nessun suono dall'app.
// Mai il messaggio «Scene Write» (scrive la memoria del nano): solo letture, entrata/uscita dalla modalità nativa e luci.
// Il Mac annuncia a voce cosa fare (macOS `say`).
const { app, BrowserWindow, session } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

app.setPath('userData', path.join(os.tmpdir(), 'cutx-midi-nano-dati'));
const FASE = process.env.NANO_FASE || 'tutto';
const OUT = process.env.NANO_OUT || path.join(os.tmpdir(), 'cutx-midi-nano.log');
fs.writeFileSync(OUT, '');
const scrivi = (r) => {
  fs.appendFileSync(OUT, `${r}\n`);
  console.log(r);
};
const dillo = (t) => execFile('say', ['-v', 'Alice', t], () => {});
const aspetta = (s) => new Promise((r) => setTimeout(r, s * 1000));

const HEAD = [0xf0, 0x42, 0x40, 0x00, 0x01, 0x13, 0x00];
const SX = {
  modo: [...HEAD, 0x1f, 0x12, 0x00, 0xf7], // «Mode Request»: risponde 5F 42 mm (00 normale, 01 nativa)
  scena: [...HEAD, 0x1f, 0x10, 0x00, 0xf7], // «Current Scene Data Dump Request»: solo lettura
  entra: [...HEAD, 0x00, 0x00, 0x01, 0xf7], // Native mode In
  esce: [...HEAD, 0x00, 0x00, 0x00, 0xf7], // Native mode Out
};
// Luci in modalità nativa (messaggi BF cc vv): acceso 0x41–0x7F, spento 0x00–0x40.
const LUCI = [
  ['S da uno a otto', 0x20, 8],
  ['M da uno a otto', 0x30, 8],
  ['R da uno a otto', 0x40, 8],
  ['PLAY', 0x29, 1],
  ['STOP', 0x2a, 1],
  ['REW', 0x2b, 1],
  ['FF', 0x2c, 1],
  ['REC', 0x2d, 1],
  ['CYCLE', 0x2e, 1],
];
const GESTI = [
  ['Fader uno: tutta la corsa, su e giù', 6],
  ['Fader otto: tutta la corsa, su e giù', 6],
  ['Manopola uno: tutto a sinistra, poi tutto a destra', 6],
  ['Manopola otto: tutto a sinistra, poi tutto a destra', 6],
  ['Tasto S uno: premilo una volta', 4],
  ['Tasto M uno: premilo una volta', 4],
  ['Tasto R uno: premilo una volta', 4],
  ['Tasto R otto: premilo una volta', 4],
  ['Tieni premuto R uno per due secondi, poi rilascia', 5],
  ['Play: premilo una volta', 4],
  ['Stop: premilo una volta', 4],
  ['Track sinistra e Track destra: una volta ciascuno', 6],
  ['Marker sinistra e Marker destra: una volta ciascuno', 6],
  ['Set: premilo una volta', 4],
  ['Cycle, Rew, Fast forward, Rec: una volta ciascuno', 8],
];

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_wc, p, cb) => cb(['midi', 'midiSysex'].includes(p)));
  session.defaultSession.setPermissionCheckHandler((_wc, p) => ['midi', 'midiSysex'].includes(p));
  const w = new BrowserWindow({ show: false });
  w.webContents.on('console-message', (_e, _l, m) => scrivi(m));
  await w.loadFile(path.join(__dirname, 'pagina.html'));
  const js = (s) => w.webContents.executeJavaScript(s);
  const marca = (t) => js(`console.log(${JSON.stringify(`PASSO ${t}`)})`);
  const esito = (t) => js(`console.log(${JSON.stringify(`ESITO ${t}`)})`);
  await js(`(async () => {
    const t0 = performance.now();
    const acc = await navigator.requestMIDIAccess({ sysex: true });
    globalThis.acc = acc;
    globalThis.coda = [];
    const hex = (d) => [...d].map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascolta = (i) => {
      i.onmidimessage = (e) => {
        const h = hex(e.data);
        if (e.data[0] === 0xf0) globalThis.coda.push(h);
        console.log(((performance.now() - t0) / 1000).toFixed(3) + ' ' + (e.data[0] === 0xf0 ? 'SX ' : '') + h);
      };
    };
    for (const i of acc.inputs.values()) { console.log('INGRESSO ' + i.name + ' | ' + i.manufacturer); ascolta(i); }
    for (const o of acc.outputs.values()) console.log('USCITA ' + o.name + ' | ' + o.manufacturer);
    acc.onstatechange = (e) => { console.log('STATO ' + e.port.name + ' ' + e.port.type + ' ' + e.port.state); if (e.port.type === 'input' && e.port.state === 'connected') ascolta(e.port); };
    globalThis.manda = (b) => { const o = [...acc.outputs.values()].find((x) => x.state === 'connected' && /CTRL/.test(x.name)); if (!o) return false; o.send(b); return true; };
    // manda un sysex e aspetta la prima risposta sysex (in testo esadecimale), o '' se non arriva niente
    globalThis.chiedi = async (b, ms = 1500) => {
      globalThis.coda.length = 0;
      if (!globalThis.manda(b)) return 'NESSUNA USCITA';
      const fine = performance.now() + ms;
      while (performance.now() < fine && !globalThis.coda.length) await new Promise((r) => setTimeout(r, 20));
      await new Promise((r) => setTimeout(r, 150)); // il dump della scena può arrivare in più pezzi
      return globalThis.coda.join(' | ');
    };
  })()`);
  const manda = (b) => js(`manda(${JSON.stringify(b)})`);
  const chiedi = (b, ms) => js(`chiedi(${JSON.stringify(b)}, ${ms || 1500})`);
  const modoDi = (r) => (/5f 42 00/.test(r) ? 'NORMALE' : /5f 42 01/.test(r) ? 'NATIVA' : r ? `?? ${r}` : 'nessuna risposta');
  const luce = (cc, v) => manda([0xbf, cc, v]);
  const spegniTutto = async () => {
    for (const [, da, n] of LUCI) for (let k = 0; k < n; k++) await luce(da + k, 0);
  };

  if (!(await js('[...acc.outputs.values()].some((o) => /nanoKONTROL2/.test(o.name))'))) {
    await esito('NANO NON TROVATO: collegalo e rilancia');
    app.quit();
    return;
  }

  if (FASE === 'sonda') {
    await marca('sonda: «Mode Request» su tutti i 16 canali globali, e identity request');
    await esito(`identity request: ${(await chiedi([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7], 2000)) || 'niente'}`);
    for (let g = 0; g < 16; g++) {
      const r = await chiedi([0xf0, 0x42, 0x40 + g, 0x00, 0x01, 0x13, 0x00, 0x1f, 0x12, 0x00, 0xf7], 700);
      await esito(`canale globale ${g + 1}: ${r || 'niente'}`);
    }
    app.quit();
    return;
  }

  await marca('1. lettura iniziale (solo lettura)');
  const scena1 = await chiedi(SX.scena, 2500);
  await esito(`scena prima: ${scena1.length ? scena1.split(' ').length + ' byte' : 'nessuna risposta'}`);
  await esito(`modo all'inizio: ${modoDi(await chiedi(SX.modo))}`);

  await marca('2. entro in modalità nativa');
  const rEntra = await chiedi(SX.entra);
  await esito(`risposta a «Native In»: ${rEntra || 'niente'}`);
  await aspetta(0.5);
  await esito(`modo dopo l'entrata: ${modoDi(await chiedi(SX.modo))}`);

  await marca('3. luci');
  dillo('Provo le luci. Guarda il nano.');
  await aspetta(3);
  for (const [nome, da, n] of LUCI) {
    await marca(`luce ${nome}`);
    dillo(`Luce ${nome}`);
    for (let k = 0; k < n; k++) await luce(da + k, 0x7f);
    await aspetta(2.2);
    for (let k = 0; k < n; k++) await luce(da + k, 0);
    await aspetta(0.6);
  }
  await marca('luce: tutte accese insieme, poi lampeggio da software (R uno ogni 300 ms)');
  dillo('Tutte insieme');
  for (const [, da, n] of LUCI) for (let k = 0; k < n; k++) await luce(da + k, 0x7f);
  await aspetta(2);
  await spegniTutto();
  dillo('Lampeggio da software');
  for (let i = 0; i < 10; i++) {
    await luce(0x40, i % 2 ? 0 : 0x7f);
    await aspetta(0.3);
  }
  await luce(0x40, 0);

  if (FASE === 'tutto') {
    await marca('4. gesti (in nativa: numeri e canale)');
    dillo('Adesso i gesti. Ti dico io cosa fare.');
    await aspetta(4);
    for (const [t, s] of GESTI) {
      await marca(t);
      dillo(t);
      await aspetta(s);
    }
    await marca('5. luci da sole? ho spento tutto: premi R uno, M uno, S uno e guarda se si accendono da soli');
    dillo('Premi R uno, M uno e S uno. Si accendono da soli?');
    await aspetta(9);

    await marca('6. stacco a metà: scollega il cavo USB del nano, aspetta 5 secondi, ricollegalo');
    dillo('Scollega il cavo del nano, aspetta cinque secondi e ricollegalo.');
    let tornato = false;
    for (let i = 0; i < 90 && !tornato; i++) {
      await aspetta(1);
      const stato = await js(`[...acc.outputs.values()].filter((o) => /CTRL/.test(o.name) && o.state === 'connected').length`);
      if (i > 3 && stato && (await js('globalThis.visto_stacco === true'))) tornato = true;
      const ora = await js(`[...acc.outputs.values()].some((o) => /CTRL/.test(o.name) && o.state === 'connected')`);
      if (!ora) await js('globalThis.visto_stacco = true');
    }
    await aspetta(2);
    await esito(`stacco visto e ricollegato: ${tornato ? 'sì' : 'NO (nessuno stacco rilevato in 90 s)'}`);
    await esito(`modo dopo il ricollegamento: ${modoDi(await chiedi(SX.modo))}`);
    await luce(0x40, 0x7f);
    await aspetta(1.5);
    await esito('luce R uno mandata in modo normale: se si accende da sola ora, a ricollegamento il nano ha già ricordato la nativa');
    await luce(0x40, 0);
    await marca('7. rientro in nativa dopo il ricollegamento');
    await chiedi(SX.entra);
    await aspetta(0.5);
    await esito(`modo dopo il rientro: ${modoDi(await chiedi(SX.modo))}`);
    await luce(0x40, 0x7f);
    await aspetta(1.5);
    await luce(0x40, 0);
  }

  await marca('8. esco dalla modalità nativa e controllo la memoria');
  await spegniTutto();
  await chiedi(SX.esce);
  await aspetta(0.5);
  await esito(`modo dopo l'uscita: ${modoDi(await chiedi(SX.modo))}`);
  const scena2 = await chiedi(SX.scena, 2500);
  await esito(`scena dopo: ${scena2.length ? scena2.split(' ').length + ' byte' : 'nessuna risposta'}`);
  await esito(scena1 && scena2 ? (scena1 === scena2 ? 'MEMORIA DEL NANO: identica a prima (non scritta)' : 'MEMORIA DEL NANO: DIVERSA da prima!') : 'memoria: confronto non possibile');
  dillo('Fatto, grazie.');
  await aspetta(2);
  app.quit();
});
