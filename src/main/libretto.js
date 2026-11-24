// --libretto=<cartella>: il giro di schermate per il libretto stampato. Ripetibile: alla prossima versione si rilancia e si rifà uguale.
// Gira come tutte le prove: dati in CUTX-prova, stash di prova, volume del Mac al 20% e poi rimesso, clip con gain bassissimo.
// Per rifare solo alcune schermate: CUTX_LIBRETTO_SOLO=01,07 (i numeri dei file).
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import * as stash from './stash.js';

const aspetta = (s) => new Promise((r) => setTimeout(r, s * 1000));
const osa = (s) => execFileSync('osascript', ['-e', s], { encoding: 'utf8' }).trim();

async function chiedi(finestra, js) {
  const wc = finestra?.webContents;
  if (!wc || wc.isDestroyed() || wc.isCrashed()) return null;
  try {
    return await Promise.race([wc.executeJavaScript(js), aspetta(3).then(() => null)]);
  } catch (e) {
    console.log(`[libretto] errore nella pagina: ${e.message}`);
    return null;
  }
}

async function aspettaChe(fn, s = 30) {
  const fine = Date.now() + s * 1000;
  while (Date.now() < fine) {
    if (await fn()) return true;
    await aspetta(0.25);
  }
  return false;
}

// I due brani dimostrativi. Ogni clip ha il gain bassissimo (non suona davvero); il beat ha un click sentinella basso solo nella scena «drop».
const G = '.gain(.0001)';
const brani = {
  libretto_notte_acida: `// @brano notte acida
// @bpm 170
setcpm(170/4)
// @apertura
s("sine*2")${G}
// @beat
// @scena intro
s("sine*2")${G}
// @scena main
s("sine*4")${G}
// @scena drop
s("sine*8")${G}
// @clip reese · bass
note("c1 [c1 eb1] g0 c1").s("sawtooth").lpf(300)${G}
// @clip sub · bass
note("c1 ~ c1 ~").s("sine")${G}
// @clip arp · arp
n("0 3 7 10").scale("C:minor").s("square")${G}
// @clip hook · lead
note("g4 bb4 c5 ~").s("sawtooth")${G}
// @clip pad · pad
note("<c3 eb3>").s("triangle")${G}
// @clip hats · perc
s("hh*8")${G}
// @clip riser · fx
s("sine").lpf(sine.range(200,4000).slow(4))${G}
// @clip melodia
note("c4 eb4 g4").s("sine")${G}
`,
  libretto_ferro: `// @brano ferro
// @bpm 174
setcpm(174/4)
// @beat
// @scena intro
s("sine*2")${G}
// @scena drop
s("sine*8")${G}
// @clip basso · bass
note("d1 d1 a0 d1").s("sawtooth")${G}
// @clip arp · arp
n("0 4 7 11").scale("D:minor").s("square")${G}
// @clip melodia · lead
note("a4 d5 f5 ~").s("sawtooth")${G}
// @clip tappeto · pad
note("<d3 f3>").s("triangle")${G}
`,
};

export async function libretto({ finestre, cartella }) {
  const solo = (process.env.CUTX_LIBRETTO_SOLO ?? '').split(',').filter(Boolean);
  const wc = finestre.controllo.webContents;
  const js = (codice) => chiedi(finestre.controllo, codice);
  const jsLive = (codice) => chiedi(finestre.live, codice);
  const nano = (cc, v) => js(`cutxProva.nano().riceve([0xb0, ${cc}, ${v}])`);
  const tocca = async (cc) => (await nano(cc, 127), await nano(cc, 0));
  const manopola = (ch, pos) => nano(16 + ch, Math.round(pos * 127));
  const sceglie = async (ch, k) => {
    const n = await js(`cutxProva.statoCanali().alternative(${ch}).length`);
    await manopola(ch, (k + 0.5) / (n + 1));
  };
  const PLAY = 41, STOP = 42, CYCLE = 46, TRACK_GIU = 59;

  const dir = path.resolve(cartella);
  await mkdir(dir, { recursive: true });
  const fatte = [];
  const saltate = [];

  const cattura = async (rect) => {
    const img = await Promise.race([rect ? wc.capturePage(rect) : wc.capturePage(), aspetta(15).then(() => null)]);
    if (!img) throw new Error('capturePage non risponde (finestra nascosta?)');
    return img;
  };
  // la cattura di un riquadro: solo l'elemento, a piena risoluzione (retina)
  // espressione = JS che dà il rettangolo {x,y,width,height} (coordinate della pagina); null se l'elemento non c'è
  const riquadroEspr = async (nome, espressione, margine = 0) => {
    const r = await js(espressione);
    if (!r || r.width < 2 || r.height < 2) {
      console.log(`[libretto] ${nome}: non trovo il riquadro`);
      saltate.push(nome);
      return false;
    }
    const x = Math.max(0, Math.floor(r.x - margine)), y = Math.max(0, Math.floor(r.y - margine));
    const rect = { x, y, width: Math.min(Math.ceil(r.width + margine * 2), 1440 - x), height: Math.min(Math.ceil(r.height + margine * 2), 900 - y) };
    await aspetta(0.4);
    try {
      await writeFile(path.join(dir, `${nome}.png`), (await cattura(rect)).toPNG());
    } catch (e) {
      console.log(`[libretto] ${nome}: cattura fallita (${e.message}) rettangolo ${JSON.stringify(rect)}`);
      saltate.push(nome);
      return false;
    }
    console.log(`[libretto] ${nome}  (${rect.width}x${rect.height})`);
    return true;
  };
  const riquadro = (nome, selettore, margine = 0) =>
    riquadroEspr(nome, `(() => { const e = document.querySelector(${JSON.stringify(selettore)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })()`, margine);
  const scriviPng = async (nome, img) => (await writeFile(path.join(dir, `${nome}.png`), img.toPNG()), console.log(`[libretto] ${nome}  (proiettore)`));
  const finestraIntera = async (nome) => {
    await aspetta(0.4);
    await writeFile(path.join(dir, `${nome}.png`), (await cattura()).toPNG());
    console.log(`[libretto] ${nome}  (finestra intera)`);
    return true;
  };
  const voluto = (n) => !solo.length || solo.includes(n);

  // 1. il volume del Mac: si legge, si abbassa al 20%, si rimette sempre
  const volume = osa('output volume of (get volume settings)');
  const rimetti = () => {
    try {
      osa(`set volume output volume ${volume}`);
    } catch {}
  };
  process.once('exit', rimetti);
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.once(sig, () => (rimetti(), process.exit(1))); // anche se la prova viene fermata a mano
  osa('set volume output volume 20');
  console.log(`[libretto] volume del Mac ${volume}% → 20%`);

  let cartellaLibreria = null;
  try {
    const pronta = await aspettaChe(async () => (await jsLive('globalThis.cutxStato?.()')) && (await js('!!globalThis.cutxProva && !!document.querySelector(".cm-editor")')));
    await aspettaChe(() => !!stash.cartellaProj(), 30); // il PROJ di prova si apre da solo
    cartellaLibreria = path.join(stash.cartellaProj(), 'libreria');
    console.log(`[libretto] · app pronta: ${pronta} (live ${!!(await jsLive('globalThis.cutxStato?.()'))}, controllo ${await js('!!globalThis.cutxProva + " " + !!document.querySelector(".cm-editor")')})`);
    await aspetta(1);
    finestre.controllo.setContentSize(1440, 900);
    await aspetta(1);

    // 2. i brani dimostrativi e lo stato di partenza: tutto fermo, nano finto, niente set
    for (const [nome, testo] of Object.entries(brani)) await writeFile(path.join(cartellaLibreria, `${nome}.cutx`), testo);
    await js(`cutxProva.fermaTutto(); cutxProva.cue.brano = null; cutxProva.cue.cambiaModo('libero'); cutxProva.nanoVistoForza(); cutxProva.serata.set = null; cutxProva.ricaricaLibreria()`);
    await js(`cutxProva.valuta('live', 'setcpm(170/4)\\ns("sine*2").gain(.0001)')`);
    await aspetta(2);
    await js(`cutxProva.scegliEntraTra(1)`);

    console.log('[libretto] · brani scritti, stato di partenza');
    const schermate = (await import('./libretto-schermate.js')).schermate;
    await schermate({ scriviPng, voluto, riquadro, riquadroEspr, finestraIntera, js, jsLive, nano, tocca, manopola, sceglie, aspetta, aspettaChe, fatte, saltate, wc, finestre, dir, brani, cartellaLibreria, PLAY, STOP, CYCLE, TRACK_GIU });
  } catch (e) {
    console.log(`[libretto] ERRORE: ${e.stack ?? e}`);
    saltate.push('errore');
  } finally {
    if (cartellaLibreria) for (const nome of Object.keys(brani)) await rm(path.join(cartellaLibreria, `${nome}.cutx`), { force: true });
    rimetti();
    console.log(`[libretto] volume rimesso a ${volume}%`);
  }
  console.log(`[libretto] fatte ${fatte.length} · saltate ${saltate.length}${saltate.length ? ': ' + saltate.join(', ') : ''}`);
  return saltate.length;
}
