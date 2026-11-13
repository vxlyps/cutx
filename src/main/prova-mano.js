// Le «prove a mano» del check-up beta 5, fatte dal Mac dove si può (docs/CHECKUP.md, capitolo 8):
//   electron . --prova=mano-primo     registra l'uscita del motore live e misura i colpi persi al primo lancio di un suono mai caricato
//   electron . --prova=mano-foto      foto della postazione: «entra tra» che cambia, avviso «senza il BEAT»
//   electron . --prova=mano-midi      porta MIDI finta che sparisce e torna (con un tasto tenuto)
//   electron . --prova=mano-schermo   lo schermo del pubblico che sparisce e torna (evento finto)
//   electron . --prova=mano-audio     un'uscita audio finta che sparisce e torna mentre suona
//   electron . --prova=mano-disco     lo stash su un'immagine disco smontata a forza mentre suona, e rimontata
// Quello che serve da fuori arriva dalle variabili CUTX_MANO_* (cartella dei risultati, uscita finta, immagine disco).
// Non sta nel pacchetto (come prova.js).
import { execFile, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { screen } from 'electron';

const aspetta = (s) => new Promise((r) => setTimeout(r, s * 1000));
const esegui = (cmd, argomenti) => new Promise((fatto) => execFile(cmd, argomenti, (e, out, err) => fatto({ errore: e ? String(e.message) : null, out: String(out), err: String(err) })));

async function chiedi(finestra, js, s = 4) {
  const wc = finestra?.webContents;
  if (!wc || wc.isDestroyed() || wc.isCrashed()) return null;
  try {
    return await Promise.race([wc.executeJavaScript(js), aspetta(s).then(() => null)]);
  } catch (e) {
    return { eccezione: String(e?.message ?? e) };
  }
}
async function finche(fn, s = 10) {
  const fine = Date.now() + s * 1000;
  while (Date.now() < fine) {
    const v = await fn();
    if (v) return v;
    await aspetta(0.2);
  }
  return null;
}

const CLICK = `setcpm(120/4)
s("sine*4").freq(1000).attack(0).decay(.02).sustain(0).gain(.3)`;

export async function provaMano({ finestre, scrivi, parti }) {
  const OUT = process.env.CUTX_MANO_OUT;
  if (!OUT) {
    scrivi('ERRORE manca CUTX_MANO_OUT (la cartella dei risultati)');
    return false;
  }
  await mkdir(OUT, { recursive: true });
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}${dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  const nota = (r) => scrivi(`     ${r}`);
  const js = (codice, s) => chiedi(finestre.controllo, codice, s);
  const live = () => chiedi(finestre.live, 'globalThis.cutxStato?.()');
  const cuffia = () => chiedi(finestre.cuffia, 'globalThis.cutxStato?.()');
  const avviso = () => js(`document.getElementById('cue-avviso')?.textContent ?? ''`);
  const a = { finestre, scrivi, controlla, nota, js, live, cuffia, avviso, OUT };
  await js(`cutxProva.motori.live.manda({ tipo: 'master', volume: 0.05 })`); // mai a volume pieno
  for (const [nome, fn] of [['mano-foto', foto], ['mano-primo', primoColpo], ['mano-midi', midiFinto], ['mano-schermo', schermo], ['mano-audio', audio], ['mano-disco', disco]]) {
    if (!parti.includes(nome)) continue;
    scrivi(`--- ${nome} ---`);
    try {
      await fn(a);
    } catch (e) {
      controlla(`${nome}: la prova si è rotta`, false, String(e.stack ?? e));
    }
  }
  await js(`cutxProva.fermaTutto()`);
  return ok;
}

// ------------------------------------------------------------------ foto

const BRANO_FOTO = '// @brano notte\n// @bpm 120\nsetcpm(120/4)\n// @beat\n// @scena intro\ns("sine*2").gain(.0001)\n// @scena sviluppo\ns("sine*4").gain(.0001)\n// @pezzo basso\nnote("c2 c2 eb2 g2").s("sine").gain(.0001)\n';

async function foto({ finestre, controlla, nota, js, avviso, live, OUT }) {
  const scatta = async (nome) => {
    const f = path.join(OUT, `${nome}.png`);
    await writeFile(f, (await finestre.controllo.webContents.capturePage()).toPNG());
    return f;
  };
  // il ritaglio di un pezzo della finestra (con un po' di margine), per vederlo bene
  const ritaglio = async (nome, selettore, margine = 16) => {
    const r = await js(`(() => { const e = document.querySelector(${JSON.stringify(selettore)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })()`);
    if (!r) return null;
    const [L, A] = finestre.controllo.getContentSize();
    const x = Math.max(0, Math.floor(r.x - margine));
    const y = Math.max(0, Math.floor(r.y - margine));
    const rett = { x, y, width: Math.min(L - x, Math.ceil(r.width + margine * 2)), height: Math.min(A - y, Math.ceil(r.height + margine * 2)) };
    const f = path.join(OUT, `${nome}.png`);
    await writeFile(f, (await finestre.controllo.webContents.capturePage(rett)).toPNG());
    return f;
  };
  const entra = () => js(`document.querySelector('[data-entra].on')?.dataset.entra ?? null`);
  const piede = `(() => { const p = document.querySelector('[data-entra]').closest('.piede'); return { dopo: p.classList.contains('entra-dopo'), cambiato: p.classList.contains('entra-cambiato') }; })()`;

  await js(`cutxProva.fermaTutto(); cutxProva.mostraVista?.('live')`);
  await js(`cutxProva.cue.apriModello('notte.cutx', ${JSON.stringify(BRANO_FOTO)}); cutxProva.cue.cambiaModo('brano')`);
  await aspetta(1.5);
  await js(`cutxProva.scegliEntraTra(1)`);
  await aspetta(1.2);
  await scatta('foto-1-prima');
  await ritaglio('ritaglio-1-entra-a-1', '.piede:has([data-entra])');

  // «entra tra» passa a 4: lampeggio, scritta, poi resta ambra
  await js(`cutxProva.scegliEntraTra(4)`);
  await aspetta(0.12);
  const subito = await js(piede);
  const scritta = await avviso();
  await scatta('foto-2-entra-tra-4-lampeggio');
  await ritaglio('ritaglio-2-entra-tra-4-lampeggio', '.piede:has([data-entra])');
  await ritaglio('ritaglio-2-scritta', '#cue-avviso', 24);
  await aspetta(2.5);
  const poi = await js(piede);
  await scatta('foto-3-entra-tra-4-fermo');
  await ritaglio('ritaglio-3-entra-tra-4-fermo', '.piede:has([data-entra])');
  controlla('«entra tra» a 4: il tasto 4 è acceso', (await entra()) === '4');
  controlla('appena cambia: il piede lampeggia e resta segnato in ambra', subito?.cambiato && subito?.dopo, JSON.stringify(subito));
  controlla('appena cambia: la scritta nel CUE', /entra tra 4 cicli/.test(scritta ?? ''), `«${scritta}»`);
  controlla('dopo due secondi e mezzo: resta ambra (non è 1)', poi?.dopo === true, JSON.stringify(poi));
  await js(`cutxProva.scegliEntraTra(1)`);
  await aspetta(0.3);
  const tornato = await js(piede);
  controlla('tornato a 1: niente più ambra', tornato?.dopo === false, JSON.stringify(tornato));

  // i tasti 1 2 4 8 nel SYNTH non fanno niente
  const wc = finestre.controllo.webContents;
  const premi = async (tasto) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode: tasto });
    wc.sendInputEvent({ type: 'char', keyCode: tasto });
    wc.sendInputEvent({ type: 'keyUp', keyCode: tasto });
    await aspetta(0.3);
  };
  await js(`document.activeElement?.blur()`);
  await premi('4');
  const fuori = await entra();
  await js(`cutxProva.scegliEntraTra(1)`);
  await js(`cutxProva.mostraVista('synth')`);
  await aspetta(0.8);
  const vista = await js(`cutxProva.vista`);
  await js(`document.activeElement?.blur()`);
  for (const t of ['2', '4', '8']) await premi(t);
  const dentro = await entra();
  await scatta('foto-6-synth-dopo-2-4-8');
  nota(`fuori dal SYNTH il tasto 4 della tastiera porta «entra tra» a: ${fuori} (dipende dal fuoco della finestra di prova)`);
  controlla('nel SYNTH i tasti 2, 4, 8 non cambiano «entra tra»', vista === 'synth' && dentro === '1', `vista ${vista}, entra tra ${dentro}`);
  await js(`cutxProva.mostraVista('live')`);
  await aspetta(0.5);

  // GO LIVE con una clip attiva e senza il beat
  await js(`cutxProva.cue.scegliSezione(2)`); // la card «basso»
  await aspetta(0.4);
  const attiva = await js(`document.querySelector('#carte .card.attiva, #carte .card.scelta')?.textContent.slice(0, 40) ?? ''`);
  await wc.executeJavaScript('cutxProva.goLive().then((r) => JSON.stringify(r ?? null), (e) => String(e))');
  await aspetta(0.25);
  const testo = await avviso();
  const lampeggia = await js(`!!document.querySelector('#carte .beat-card.manca-beat')`);
  await scatta('foto-4-senza-beat');
  await ritaglio('ritaglio-4-senza-beat-scritta', '#cue-avviso', 24);
  await ritaglio('ritaglio-4-senza-beat-card', '#carte .beat-card', 12);
  await aspetta(0.6);
  await ritaglio('ritaglio-5-senza-beat-card-dopo', '#carte .beat-card', 12);
  nota(`card attiva al momento del GO LIVE: «${attiva}»`);
  controlla('GO LIVE su una clip senza il beat: la scritta', /va live senza il BEAT/.test(testo ?? ''), `«${testo}»`);
  controlla('GO LIVE su una clip senza il beat: la card BEAT segnata in ambra', lampeggia === true);
  await aspetta(5.5);
  controlla('dopo 5 secondi la card BEAT torna normale', (await js(`!!document.querySelector('#carte .beat-card.manca-beat')`)) === false);
  const livelli = (await live())?.livelli ?? [];
  controlla('la clip è andata live lo stesso', livelli.some((l) => l.nome === 'basso'), livelli.map((l) => l.nome).join(','));
  await js(`cutxProva.fermaTutto()`);
}

// ------------------------------------------------------------------ primo colpo

// Un registratore dentro il motore live: prende quello che esce (dopo il volume generale) con il tempo esatto di ogni blocco.
const REGISTRATORE = `class R extends AudioWorkletProcessor {
  constructor() { super(); this.b = new Float32Array(2048); this.n = 0; this.t = 0; }
  process(ingressi) {
    const s = ingressi[0]?.[0], d = ingressi[0]?.[1] ?? s;
    if (!s) return true;
    if (this.n === 0) this.t = currentTime;
    for (let i = 0; i < s.length; i++) this.b[this.n + i] = (s[i] + d[i]) / 2;
    this.n += s.length;
    if (this.n >= this.b.length) { this.port.postMessage({ t: this.t, d: this.b.slice(0, this.n) }); this.n = 0; }
    return true;
  }
}
registerProcessor('cutx-registratore', R);`;
const MONTA = `(async () => {
  if (globalThis.__reg) return true;
  const p = cutxPresa();
  await p.ac.audioWorklet.addModule('data:text/javascript,' + encodeURIComponent(${JSON.stringify(REGISTRATORE)}));
  const n = new AudioWorkletNode(p.ac, 'cutx-registratore');
  const muto = new GainNode(p.ac, { gain: 0 });
  p.uscita.connect(n).connect(muto).connect(p.ac.destination);
  const r = (globalThis.__reg = { pezzi: [], t0: null, sr: p.ac.sampleRate, on: false });
  n.port.onmessage = ({ data }) => { if (!r.on) return; if (r.t0 === null) r.t0 = data.t; r.pezzi.push(data.d); };
  return true;
})()`;
const PRENDI = `(() => {
  const r = globalThis.__reg; r.on = false;
  const n = r.pezzi.reduce((s, p) => s + p.length, 0);
  const tutto = new Float32Array(n); let o = 0;
  for (const p of r.pezzi) { tutto.set(p, o); o += p.length; }
  const b = new Uint8Array(tutto.buffer); let s = '';
  for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768));
  const fuori = { t0: r.t0, sr: r.sr, b64: btoa(s) };
  r.pezzi = []; r.t0 = null;
  return fuori;
})()`;

function wav(campioni, sr, guadagno) {
  const dati = Buffer.alloc(campioni.length * 2);
  for (let i = 0; i < campioni.length; i++) dati.writeInt16LE(Math.round(Math.max(-1, Math.min(1, campioni[i] * guadagno)) * 32767), i * 2);
  const t = Buffer.alloc(44);
  t.write('RIFF', 0);
  t.writeUInt32LE(36 + dati.length, 4);
  t.write('WAVEfmt ', 8);
  t.writeUInt32LE(16, 16);
  t.writeUInt16LE(1, 20);
  t.writeUInt16LE(1, 22);
  t.writeUInt32LE(sr, 24);
  t.writeUInt32LE(sr * 2, 28);
  t.writeUInt16LE(2, 32);
  t.writeUInt16LE(16, 34);
  t.write('data', 36);
  t.writeUInt32LE(dati.length, 40);
  return Buffer.concat([t, dati]);
}

const mediana = (v) => [...v].sort((x, y) => x - y)[Math.floor(v.length / 2)] ?? 0;

// I colpi attesi sono a tDa + k·passo. Per ogni colpo: l'energia nella sua finestra, confrontata con quella dello stesso colpo nei
// cicli dopo (quando il suono è di sicuro caricato). Sotto un quarto: il colpo non è uscito.
export function analizza({ campioni, sr, t0, tempi, passo, perCiclo }) {
  const tDa = tempi[0];
  const rms = (da, a) => {
    const i = Math.max(0, Math.round((da - t0) * sr));
    const f = Math.min(campioni.length, Math.round((a - t0) * sr));
    if (f <= i) return 0;
    let s = 0;
    for (let k = i; k < f; k++) s += campioni[k] * campioni[k];
    return Math.sqrt(s / (f - i));
  };
  const colpi = [];
  for (const t of tempi) colpi.push(rms(t, t + passo * 0.95));
  const riferimento = Array.from({ length: perCiclo }, (_, j) => mediana(colpi.filter((_, k) => k % perCiclo === j && k >= perCiclo * 2)));
  const presente = colpi.map((e, k) => riferimento[k % perCiclo] > 0 && e >= riferimento[k % perCiclo] * 0.25);
  const primo = presente.indexOf(true);
  // il primo istante con suono dopo l'ingresso (soglia: un decimo del picco dei cicli dopo)
  let picco = 0;
  const dopo = Math.max(0, Math.round((tDa + perCiclo * 2 * passo - t0) * sr));
  for (let k = dopo; k < campioni.length; k++) picco = Math.max(picco, Math.abs(campioni[k]));
  let primoSuono = null;
  for (let k = Math.max(0, Math.round((tDa - 0.05 - t0) * sr)); k < campioni.length; k++) {
    if (Math.abs(campioni[k]) > picco * 0.1) {
      primoSuono = t0 + k / sr - tDa;
      break;
    }
  }
  const prima = rms(tDa - 0.4, tDa - 0.02); // prima dell'ingresso dev'esserci silenzio
  return { colpi, presente, primo, mancatiNelPrimoCiclo: presente.slice(0, perCiclo).filter((p) => !p).length, mancatiInTutto: presente.filter((p) => !p).length, primoSuonoS: primoSuono, picco, rumorePrima: prima };
}

async function primoColpo({ finestre, controlla, nota, js, live, scrivi, OUT }) {
  const stash = await js(`window.cutx.stash().then((s) => ({ percorso: s.percorso, suoni: Object.keys(s.suoni ?? {}).filter((k) => k !== '_base') }))`, 10);
  const voluti = (process.env.CUTX_MANO_SUONI ?? '').split(',').filter(Boolean);
  const suoni = (voluti.length ? voluti : stash?.suoni ?? []).filter((s) => /^[a-z0-9_]+$/i.test(s));
  nota(`stash: ${stash?.percorso} · suoni provati: ${suoni.join(', ')}`);
  if (!(await chiedi(finestre.live, 'typeof globalThis.cutxPresa')) || !suoni.length) return controlla('il motore live ha la presa per registrare e lo stash ha suoni', false);
  controlla('registratore montato sull\'uscita del motore live', (await chiedi(finestre.live, MONTA, 10)) === true);
  const PER_CICLO = 4;
  const CICLI = 6;
  const righe = [];
  const giro = async (suono, quale) => {
    await js(`cutxProva.fermaTutto()`);
    await aspetta(1.2);
    const brano = `// @brano prova\n// @bpm 120\nsetcpm(120/4)\n// @beat\n// @scena uno\ns("${suono}*${PER_CICLO}").clip(1)\n`;
    await js(`cutxProva.cue.apriModello('prova-${suono}.cutx', ${JSON.stringify(brano)}); cutxProva.cue.cambiaModo('brano'); cutxProva.scegliEntraTra(1)`);
    await aspetta(1.2);
    await js(`cutxProva.cue.scegliSezione(0)`);
    await chiedi(finestre.live, `(globalThis.__reg.pezzi = [], globalThis.__reg.t0 = null, globalThis.__reg.on = true, cutxRegistro(true), 1)`);
    const vecchi = new Set(((await live())?.livelli ?? []).map((x) => x.id));
    await aspetta(0.5);
    const premuto = await chiedi(finestre.live, `cutxPresa().ac.currentTime`);
    const esito = await finestre.controllo.webContents.executeJavaScript('cutxProva.goLive().then((r) => JSON.stringify(r ?? null), (e) => "ECCEZIONE " + e)');
    const l = await finche(async () => (await live())?.livelli?.find((x) => x.nome === 'beat' && !vecchi.has(x.id)), 6);
    if (!l) return controlla(`${suono} (${quale}): il beat entra nel live`, false, `go live: ${esito} · ${await js(`document.getElementById('cue-avviso')?.textContent`)}`);
    await finche(async () => ((await live())?.ciclo ?? 0) > l.da + CICLI + 0.3, 30);
    // i colpi che il motore ha programmato davvero per questo livello (ciclo di ognuno), e il loro orario
    const programmati = [...new Set(((await chiedi(finestre.live, 'cutxRegistro(false)', 10)) ?? []).filter((e) => e[0] === l.id).map((e) => e[1]))].sort((x, y) => x - y).filter((c) => c < l.da + CICLI);
    if (process.env.CUTX_MANO_SPIA) scrivi(`SPIA ${JSON.stringify({ l, dopo: (await live())?.livelli, guadagni: (await live())?.guadagni, dissolvenze: (await live())?.dissolvenze, tagliato: (await live())?.tagliato })}`);
    const tempi = await chiedi(finestre.live, `(() => { const p = cutxPresa(); return ${JSON.stringify(programmati)}.map((c) => p.tempo(c)); })()`);
    const presa = { tDa: tempi?.[0] };
    const errore = (await live())?.errore ?? null;
    const reg = await chiedi(finestre.live, PRENDI, 20);
    if (!reg?.b64 || !tempi?.length) return controlla(`${suono} (${quale}): registrazione presa e colpi programmati`, false, `colpi programmati ${programmati.length}`);
    const b = Buffer.from(reg.b64, 'base64');
    const campioni = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
    const passo = tempi[1] - tempi[0];
    const m = analizza({ campioni, sr: reg.sr, t0: reg.t0, tempi, passo, perCiclo: PER_CICLO });
    const f = path.join(OUT, `primo-colpo-${suono}-${quale}.wav`);
    await writeFile(f, wav(campioni, reg.sr, m.picco > 0 ? 0.9 / m.picco : 1));
    const riga = { suono, quale, entraAlCiclo: l.da, primoProgrammato: programmati[0], programmati: programmati.length, anticipoS: +(presa.tDa - premuto).toFixed(3), mancatiPrimoCiclo: m.mancatiNelPrimoCiclo, mancatiInTutto: m.mancatiInTutto, primoColpoUscito: m.primo + 1, primoSuonoMs: m.primoSuonoS === null ? null : Math.round(m.primoSuonoS * 1000), presenti: m.presente.map((p) => (p ? 'x' : '.')).join(''), rumorePrima: +m.rumorePrima.toExponential(1), picco: +m.picco.toExponential(2), errore, file: f };
    righe.push(riga);
    scrivi(`MISURA ${JSON.stringify(riga)}`);
  };
  for (const s of suoni) {
    await giro(s, 'mai-sentito'); // un suono solo per avvio dell'app: un secondo brano entrerebbe in dissolvenza (passaggio) e falserebbe la misura
  }
  await writeFile(path.join(OUT, `primo-colpo-${Date.now()}.json`), JSON.stringify(righe, null, 1));
  const freddi = righe.filter((r) => r.quale === 'mai-sentito');
  controlla('primo lancio di un suono mai caricato: il primo colpo esce', freddi.length > 0 && freddi.every((r) => r.mancatiPrimoCiclo === 0), `${freddi.filter((r) => r.mancatiPrimoCiclo > 0).length} lanci su ${freddi.length} perdono colpi · ${freddi.map((r) => `${r.suono}:${r.presenti.slice(0, 8)}`).join(' ')}`);
}

// ------------------------------------------------------------------ porta MIDI finta

async function midiFinto({ controlla, nota, js, live }) {
  const c = 'cutxProva.controllerMidi';
  const vero = await js(`({ collegato: ${c}.collegato, porta: ${c}.nomePorta, modo: ${c}.modo, ingressi: [...(${c}.access?.inputs.values() ?? [])].map((p) => p.name + ' ' + p.state), uscite: [...(${c}.access?.outputs.values() ?? [])].map((p) => p.name + ' ' + p.state) })`);
  nota(`controller vero visto dall'app: ${JSON.stringify(vero)}`);
  await js(`window.cutx.salvaPreferenze({ controller: null })`);
  // una porta finta al posto di quella vera: stesso nome, e si può far sparire e tornare
  await js(`(() => {
    const k = ${c};
    const f = (globalThis.__finta = { log: [], vera: k.access });
    f.ing = { name: 'X-TOUCH MINI', state: 'connected', onmidimessage: null };
    f.usc = { name: 'X-TOUCH MINI', state: 'connected', send: (b) => f.log.push([...b]) };
    f.acc = { inputs: new Map([['i', f.ing]]), outputs: new Map([['u', f.usc]]), onstatechange: k.access.onstatechange };
    f.stacca = () => { f.ing.state = f.usc.state = 'disconnected'; f.acc.inputs.clear(); f.acc.outputs.clear(); f.acc.onstatechange(); };
    f.attacca = () => { f.ing = { name: 'X-TOUCH MINI', state: 'connected', onmidimessage: null }; f.usc.state = 'connected'; f.acc.inputs.set('i', f.ing); f.acc.outputs.set('u', f.usc); f.acc.onstatechange(); };
    k.access = f.acc;
    f.acc.onstatechange();
  })()`);
  await aspetta(0.5);
  controlla('la porta finta è quella in uso', await js(`${c}.porta.ingresso === __finta.ing && ${c}.collegato`));
  await js(`cutxProva.fermaTutto(); ${c}.pagina = 'A'`);
  await js(`cutxProva.valuta('live', 'setcpm(120/4)\\nnote("c2 e2").s("sine").gain(.0001)', 'uno')`);
  await aspetta(3);
  const prima = (await live())?.livelli?.filter((l) => l.a === null).length;
  // tutta la fila bassa tenuta premuta (e una manopola premuta), poi il cavo «si stacca»
  const tasti = await js(`${c}.tab.tasti`);
  for (const n of tasti.slice(8)) if (Number.isInteger(n)) await js(`__finta.ing.onmidimessage({ data: [0x90, ${n}, 127] })`);
  await aspetta(0.3);
  const tenuti = await js(`({ push: ${c}.push.size, cuffia: ${c}.cuffiaTenuta, paracadute: !!${c}.paracaduteTenuto, passa: !!${c}.passaTenuto, colpi: ${c}.colpi.attivi.size })`);
  nota(`con la fila bassa tenuta: ${JSON.stringify(tenuti)}`);
  await js(`__finta.log.length = 0; __finta.stacca()`);
  await aspetta(1.5); // più del tempo di un tasto «tenuto»: se qualcosa era rimasto armato, scatta adesso
  const dopo = await js(`({ collegato: ${c}.collegato, modo: ${c}.modo, push: ${c}.push.size, cuffia: ${c}.cuffiaTenuta, paracadute: !!${c}.paracaduteTenuto, passa: !!${c}.passaTenuto, colpi: ${c}.colpi.attivi.size })`);
  controlla('staccato: l\'app lo sa', dopo?.collegato === false && dopo?.modo === 'sconosciuto', JSON.stringify(dopo));
  controlla('staccato con i tasti tenuti: niente resta premuto', dopo && dopo.push === 0 && dopo.cuffia === null && !dopo.paracadute && !dopo.passa && dopo.colpi === 0, JSON.stringify(dopo));
  await aspetta(2.5);
  const vivi = (await live())?.livelli?.filter((l) => l.a === null).length;
  controlla('staccato: il live suona come prima (stessi livelli, nessuno stop o paracadute partito da solo)', vivi === prima && !(await live())?.paracadute, `prima ${prima}, dopo ${vivi}`);
  controlla('staccato: nessun messaggio mandato a una porta che non c\'è', (await js(`__finta.log.length`)) === 0);
  // il cavo torna
  await js(`__finta.attacca()`);
  await aspetta(1.2);
  const log = await js(`__finta.log`);
  const mc = log.filter((b) => b[0] === 0xba && b[1] === 127 && b[2] === 1).length;
  const luci = log.filter((b) => b[0] === 0x90 || b[0] === 0xb0).length;
  const tornato = await js(`({ collegato: ${c}.collegato, modo: ${c}.modo, provatoMC: ${c}.provatoMC })`);
  controlla('riattaccato: richiesta della modalità MC mandata di nuovo', mc >= 1, `${mc} richieste`);
  controlla('riattaccato: le luci vengono rimandate tutte', luci >= 16, `${luci} messaggi di luce in 1,2 s`);
  controlla('riattaccato: collegato e in MC', tornato?.collegato && tornato?.modo === 'MC', JSON.stringify(tornato));
  // un tasto dopo il ritorno funziona (▶ non c'è: uso lo stop del primo livello? no: solo che il messaggio arrivi senza errori)
  const errPrima = await js(`document.getElementById('cue-avviso')?.textContent ?? ''`);
  for (const n of tasti.slice(8)) if (Number.isInteger(n)) await js(`__finta.ing.onmidimessage({ data: [0x90, ${n}, 0] })`);
  await aspetta(0.3);
  controlla('riattaccato: i rilasci arrivati dopo non fanno danni', !/errore interno/.test((await js(`document.getElementById('cue-avviso')?.textContent ?? ''`)) ?? '') || /errore interno/.test(errPrima ?? ''));
  // si rimette la porta vera
  await js(`(() => { const k = ${c}; k.access = __finta.vera; k.access.onstatechange?.(); })()`);
  await aspetta(1);
  const fine = await js(`({ collegato: ${c}.collegato, porta: ${c}.nomePorta, modo: ${c}.modo })`);
  nota(`rimessa la porta vera: ${JSON.stringify(fine)}`);
  await js(`cutxProva.fermaTutto()`);
}

// ------------------------------------------------------------------ schermo del pubblico

async function schermo({ finestre, controlla, nota, js, live }) {
  await js(`cutxProva.fermaTutto()`);
  await js(`cutxProva.valuta('live', 'setcpm(120/4)\\nnote("c2 e2").s("sine").gain(.0001)', 'uno')`);
  if (!finestre.uscita) await js(`window.cutx.uscitaOnOff()`);
  const aperta = await finche(async () => finestre.uscita && (await chiedi(finestre.uscita, 'globalThis.cutxUscita?.()'))?.livelli?.length > 0, 10);
  controlla('finestra del pubblico aperta, col livello live', !!aperta);
  if (!aperta) return;
  const d = screen.getDisplayMatching(finestre.uscita.getBounds());
  nota(`schermi collegati: ${screen.getAllDisplays().length} · la finestra del pubblico è sullo schermo ${d.id}`);
  const cicloPrima = (await live())?.ciclo;
  screen.emit('display-removed', {}, d); // quello che Electron dice quando stacchi il cavo
  const chiusa = await finche(async () => !finestre.uscita || finestre.uscita.isDestroyed(), 3);
  controlla('schermo «staccato»: la finestra del pubblico si chiude', !!chiusa);
  await aspetta(2);
  const s = await live();
  controlla('il live continua e la postazione risponde', s?.ciclo > cicloPrima + 0.5 && s.livelli.some((l) => l.a === null) && (await js(`!!globalThis.cutxProva`)) === true, `ciclo ${cicloPrima?.toFixed(2)} → ${s?.ciclo?.toFixed(2)}`);
  controlla('la finestra non si riapre da sola finché lo schermo non torna', !finestre.uscita || finestre.uscita.isDestroyed());
  screen.emit('display-added', {}, d);
  const tornata = await finche(async () => finestre.uscita && !finestre.uscita.isDestroyed() && (await chiedi(finestre.uscita, 'globalThis.cutxUscita?.()'))?.livelli?.length > 0, 8);
  controlla('schermo «ricollegato»: la finestra torna da sola e mostra il live', !!tornata);
  // uno schermo che non c'entra: la finestra non si tocca
  screen.emit('display-removed', {}, { id: -12345 });
  await aspetta(1);
  controlla('se sparisce un altro schermo la finestra del pubblico resta', finestre.uscita && !finestre.uscita.isDestroyed());
  await js(`window.cutx.uscitaOnOff()`);
  await aspetta(0.8);
  screen.emit('display-added', {}, d);
  await aspetta(2);
  controlla('chiusa da me: un nuovo schermo non la riapre', !finestre.uscita || finestre.uscita.isDestroyed());
  await js(`cutxProva.fermaTutto()`);
}

// ------------------------------------------------------------------ uscita audio che sparisce

function uscitaFinta() {
  const cp = spawn(process.env.CUTX_MANO_FINTA, ['CUTX Prova Uscita'], { stdio: ['ignore', 'pipe', 'ignore'] });
  return { cp, pronta: new Promise((r) => cp.stdout.once('data', (d) => r(String(d).includes('CREATA')))), tolta: () => new Promise((r) => (cp.once('exit', r), cp.kill('SIGTERM'))) };
}

async function audio({ finestre, controlla, nota, js, live, avviso }) {
  if (!process.env.CUTX_MANO_FINTA || !existsSync(process.env.CUTX_MANO_FINTA)) return controlla('c\'è lo strumento per l\'uscita finta (CUTX_MANO_FINTA)', false);
  const etichette = () => chiedi(finestre.live, `navigator.mediaDevices.enumerateDevices().then((d) => d.filter((x) => x.kind === 'audiooutput').map((x) => x.label))`);
  const configPrima = await js(`window.cutx.stash().then((s) => s.config)`, 10);
  nota(`uscite scritte nello stash di prova: ${JSON.stringify(configPrima?.uscite)} · viste dal motore: ${JSON.stringify(await etichette())}`);
  let finta = uscitaFinta();
  try {
    controlla('uscita finta creata', await finta.pronta);
    const nome = await finche(async () => (await etichette())?.find((e) => /CUTX Prova Uscita/.test(e)), 8);
    controlla('il motore live la vede tra le uscite', !!nome, nome ?? '');
    if (!nome) return;
    await js(`window.cutx.salvaConfig({ uscite: { ...${JSON.stringify(configPrima?.uscite ?? {})}, live: ${JSON.stringify(nome)} } })`, 10);
    await js(`window.cutx.rileggiStash?.()`);
    const scelta = await finche(async () => {
      const s = await live();
      return s?.uscita?.ok && s.uscita.dettaglio.includes('CUTX Prova') ? s : null;
    }, 10);
    controlla('il live suona sull\'uscita finta', !!scelta, JSON.stringify((await live())?.uscita));
    if (!scelta) return;
    await js(`cutxProva.fermaTutto()`);
    await js(`cutxProva.motori.live.manda({ tipo: 'master', volume: 0.3 })`); // la sentinella deve sentire il click
    await js(`cutxProva.avviaTest(${JSON.stringify(CLICK)})`);
    await aspetta(4);
    await chiedi(finestre.live, 'cutxAzzeraMisure()');
    await aspetta(4);
    const base = (await live()).sentinella;
    controlla('prima di staccare: il click esce tutto (4 secondi)', base.sentiti >= 6 && base.mancati === 0, JSON.stringify(base));
    // via l'uscita
    await chiedi(finestre.live, 'cutxAzzeraMisure()');
    const t0 = Date.now();
    await finta.tolta();
    const detto = await finche(async () => {
      const s = await live();
      return s?.uscita?.ok === false ? s : null;
    }, 8);
    const quanto = ((Date.now() - t0) / 1000).toFixed(1);
    controlla('uscita sparita: il motore se ne accorge e lo dice', !!detto, `dopo ${quanto} s · «${(await live())?.uscita?.dettaglio}»`);
    await aspetta(6);
    const s1 = await live();
    nota(`click nei ${(Date.now() - t0) / 1000 | 0} secondi dopo lo stacco: ${JSON.stringify(s1.sentinella)} · contesto audio ${s1.contesto} · giro più lungo ${Math.round(s1.giroMax)} ms`);
    controlla('uscita sparita: il motore continua a girare (contesto acceso, il ciclo avanza)', s1.contesto === 'running' && s1.ciclo > detto?.ciclo);
    const scritta = await avviso();
    controlla('uscita sparita: l\'avviso si legge nel CUE', /uscita/.test(scritta ?? ''), `«${scritta}»`);
    await chiedi(finestre.live, 'cutxAzzeraMisure()');
    await aspetta(4);
    const s2 = (await live()).sentinella;
    controlla('uscita sparita: dopo l\'assestamento il click esce tutto, sull\'uscita predefinita', s2.sentiti >= 6 && s2.mancati === 0, JSON.stringify(s2));
    // torna
    await chiedi(finestre.live, 'cutxAzzeraMisure()');
    finta = uscitaFinta();
    await finta.pronta;
    const t1 = Date.now();
    const ripresa = await finche(async () => {
      const s = await live();
      return s?.uscita?.ok && s.uscita.dettaglio.includes('CUTX Prova') ? s : null;
    }, 10);
    controlla('uscita tornata: il live ci torna da solo', !!ripresa, `dopo ${((Date.now() - t1) / 1000).toFixed(1)} s · «${(await live())?.uscita?.dettaglio}»`);
    await aspetta(5);
    const s3 = await live();
    nota(`click nei 5 secondi dopo il ritorno: ${JSON.stringify(s3.sentinella)} · contesto ${s3.contesto}`);
    await chiedi(finestre.live, 'cutxAzzeraMisure()');
    await aspetta(4);
    const s4 = (await live()).sentinella;
    controlla('uscita tornata: il click esce tutto', s4.sentiti >= 6 && s4.mancati === 0, JSON.stringify(s4));
    controlla('l\'avviso nel CUE è sparito', !/non collegata/.test((await avviso()) ?? ''), `«${await avviso()}»`);
  } finally {
    await js(`cutxProva.fermaTutto()`);
    await js(`cutxProva.motori.live.manda({ tipo: 'master', volume: 0.05 })`);
    if (configPrima?.uscite) await js(`window.cutx.salvaConfig({ uscite: ${JSON.stringify(configPrima.uscite)} })`, 10);
    if (finta.cp.exitCode === null) await finta.tolta();
  }
}

// ------------------------------------------------------------------ disco dello stash smontato a forza

async function disco({ finestre, controlla, nota, js, live, cuffia, avviso }) {
  const immagine = process.env.CUTX_MANO_IMMAGINE;
  const st = await js(`window.cutx.stash().then((s) => ({ percorso: s.percorso, config: s.config, suoni: Object.keys(s.suoni ?? {}).length, mancante: !!s.mancante, copiaAttiva: !!s.copiaAttiva }))`, 10);
  if (!immagine || !st?.percorso?.startsWith('/Volumes/CUTX-PROVA-STASH')) return controlla('lo stash in uso è quello sull\'immagine di prova', false, `stash: ${st?.percorso} · questa prova non tocca nessun altro disco`);
  const volume = '/Volumes/CUTX-PROVA-STASH';
  const fileConfig = path.join(st.percorso, 'stash.json');
  const configPrima = readFileSync(fileConfig, 'utf8');
  nota(`stash: ${st.percorso} · ${st.suoni - 1} suoni · uscite ${JSON.stringify(st.config?.uscite)} · offset cuffia ${st.config?.offsetCuffiaMs} ms`);
  const motori = async () => ({ live: (await live())?.uscita, cuffia: (await cuffia())?.uscita, offset: await chiedi(finestre.cuffia, 'cutxPresa().offsetMs') });
  const uscitePrima = await motori();
  nota(`motori prima: ${JSON.stringify(uscitePrima)}`);
  await js(`cutxProva.fermaTutto()`);
  await js(`cutxProva.motori.live.manda({ tipo: 'master', volume: 0.3 })`); // la sentinella deve sentire il click
  await js(`cutxProva.avviaTest(${JSON.stringify(CLICK)})`);
  await aspetta(5);
  await chiedi(finestre.live, 'cutxAzzeraMisure()');
  await aspetta(4);
  const base = (await live()).sentinella;
  controlla('prima di smontare: il click esce tutto', base.sentiti >= 6 && base.mancati === 0, JSON.stringify(base));
  await chiedi(finestre.live, 'cutxAzzeraMisure()');
  const pidPrima = ['controllo', 'live', 'cuffia'].map((r) => finestre[r].webContents.getOSProcessId()).join(',');

  const smonta = await esegui('/usr/sbin/diskutil', ['unmount', 'force', volume]);
  controlla('disco smontato a forza mentre suona', !smonta.errore && !existsSync(fileConfig), smonta.errore ?? smonta.out.trim());
  await aspetta(8);
  const s1 = await live();
  controlla('senza disco: il click continua senza perdere colpi (8 secondi)', s1?.sentinella?.sentiti >= 12 && s1.sentinella.mancati === 0, JSON.stringify(s1?.sentinella));
  const fascia = () => js(`(() => { const f = document.getElementById('avviso-stash'); return f.hidden ? '' : f.textContent.trim().replace(/\\s+/g, ' '); })()`);
  const f1 = await fascia();
  controlla('senza disco: entro 8 secondi compare la fascia «stash non collegato» (o «uso la copia»)', /non è collegato|COPIA/.test(f1), f1 || 'nessuna fascia');
  const pidDopo = ['controllo', 'live', 'cuffia'].map((r) => finestre[r].webContents.getOSProcessId()).join(',');
  controlla('senza disco: nessun processo è ripartito', pidPrima === pidDopo, `${pidPrima} → ${pidDopo}`);
  const uscite1 = await motori();
  controlla('senza disco: uscite audio e offset della cuffia sono quelli di prima', JSON.stringify(uscite1) === JSON.stringify(uscitePrima), JSON.stringify(uscite1));
  const st1 = await js(`window.cutx.stash().then((s) => ({ percorso: s.percorso, mancante: !!s.mancante, copia: s.copia, copiaAttiva: !!s.copiaAttiva, suoni: Object.keys(s.suoni ?? {}).length }), (e) => ({ errore: String(e) }))`, 10);
  nota(`senza disco, lo stash visto dall'app: ${JSON.stringify(st1)} · avviso nel CUE: «${await avviso()}»`);
  // si prova a lavorare: go live di un synth, salvataggio di un brano, cambio di impostazione
  const go = await finestre.controllo.webContents.executeJavaScript(`(async () => { cutxProva.scriviCue('note("c3 e3 g3").s("triangle").gain(.0001)'); cutxProva.scegliEntraTra(1); try { return JSON.stringify((await cutxProva.goLive()) ?? null); } catch (e) { return 'ECCEZIONE ' + e; } })()`);
  await aspetta(3);
  const s2 = await live();
  controlla('senza disco: un go live di un synth entra lo stesso', s2?.livelli?.some((l) => l.a === null), `go live: ${go} · livelli ${s2?.livelli?.map((l) => l.nome).join(',')}`);
  const salva = await js(`window.cutx.salvaConfig({ offsetCuffiaMs: ${Number(st.config?.offsetCuffiaMs) || 0} }).then((r) => 'risposta ' + JSON.stringify(r ?? null), (e) => 'rifiutato: ' + e.message)`, 10);
  nota(`senza disco, salvare le impostazioni dello stash: ${salva}`);
  const fantasma = existsSync(volume);
  controlla('senza disco: l\'app non ha ricreato la cartella dello stash sul disco interno', !fantasma, fantasma ? `${volume} esiste: ${(await esegui('/bin/ls', ['-la', volume])).out}` : '');
  controlla('senza disco: la postazione risponde', (await js(`!!globalThis.cutxProva && cutxProva.diagnosi().liveViva`)) === true);
  const campionePerso = await finestre.controllo.webContents.executeJavaScript(`(async () => { cutxProva.scriviCue('s("x1_05_6_audio_0009").gain(.3)'); try { return JSON.stringify((await cutxProva.goLive()) ?? null); } catch (e) { return 'ECCEZIONE ' + e; } })()`);
  await aspetta(4);
  const s3 = await live();
  nota(`senza disco, go live di un campione mai caricato: ${campionePerso} · errore del live: ${JSON.stringify(s3?.errore)} · avviso: «${await avviso()}»`);
  controlla('senza disco: un campione che non si può leggere non ferma il motore', s3?.contesto === 'running' && s3.ciclo > s2?.ciclo, `contesto ${s3?.contesto}`);

  // il disco torna
  const monta = await esegui('/usr/bin/hdiutil', ['attach', immagine, '-nobrowse']);
  controlla('disco rimontato', !monta.errore && existsSync(fileConfig), monta.errore ?? '');
  const tornato = await finche(async () => {
    const s = await js(`window.cutx.stash().then((s) => ({ mancante: !!s.mancante, copiaAttiva: !!s.copiaAttiva, suoni: Object.keys(s.suoni ?? {}).length, config: s.config }))`, 10);
    return s && !s.mancante && !s.copiaAttiva && s.suoni === st.suoni ? s : null;
  }, 15);
  controlla('disco tornato: l\'app rivede lo stash con tutti i suoni', !!tornato, JSON.stringify(await js(`window.cutx.stash().then((s) => ({ mancante: !!s.mancante, copiaAttiva: !!s.copiaAttiva, suoni: Object.keys(s.suoni ?? {}).length }))`, 10)));
  await aspetta(6);
  controlla('disco tornato: stash.json è identico a prima', existsSync(fileConfig) && readFileSync(fileConfig, 'utf8') === configPrima);
  const f2 = await fascia();
  controlla('disco tornato: la fascia se ne va', f2 === '', f2);
  const uscite2 = await motori();
  controlla('disco tornato: uscite audio e offset della cuffia sono quelli di prima', JSON.stringify(uscite2) === JSON.stringify(uscitePrima), JSON.stringify(uscite2));
  const s4 = await live();
  nota(`avviso nel CUE dopo il ritorno: «${await avviso()}» · errore del live: ${JSON.stringify(s4?.errore)}`);
  await js(`cutxProva.fermaTutto()`);
}
