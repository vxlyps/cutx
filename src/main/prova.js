// Prova automatica di robustezza (npm run prova). Fa suonare il click di test su live e cuffia,
// poi blocca e crasha interfaccia e cuffia, una cosa alla volta. Per ogni fase conta i click
// che la sentinella del live ha sentito davvero in uscita: le casse non devono perderne uno.
import path from 'node:path';
import { appendFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import * as stash from './stash.js';
import { leggiAls, leggiAlsFile } from '../ableton/leggi.js';
import { converti } from '../ableton/converti.js';
import { durataWav, risolviFile } from './ableton.js';
import * as finto from '../../test/als-finto.js';
import os from 'node:os';
import { existsSync } from 'node:fs';

// Lo stesso click del test di sfasamento, più piano: la prova suona dalle casse del Mac.
const CODICE = `setcpm(120/4)
s("sine*4").freq(1000).attack(0).decay(.02).sustain(0).gain(.3)`;
const FASE_S = 10;

const aspetta = (s) => new Promise((r) => setTimeout(r, s * 1000));

async function chiedi(finestra, js) {
  const wc = finestra?.webContents;
  if (!wc || wc.isDestroyed() || wc.isCrashed()) return null;
  try {
    return await Promise.race([wc.executeJavaScript(js), aspetta(2).then(() => null)]);
  } catch {
    return null;
  }
}

async function aspettaChe(fn, s = 30) {
  for (let i = 0; i < s * 4; i++) {
    if (await fn()) return true;
    await aspetta(0.25);
  }
  return false;
}

// Le prove usano la tastiera e il fuoco dell'editor, che esistono solo se la finestra è quella attiva di macOS: se in quel
// momento si sta usando un'altra applicazione (un browser, il Terminale) i fuochi non arrivano e i controlli falliscono per
// motivi che non c'entrano con CUTX. Prima di ogni parte si porta la finestra in primo piano.
// macOS non lascia più a un'applicazione partita dal Terminale il diritto di prendersi il fuoco: se la finestra non è quella
// attiva, `element.focus()` non fa scattare l'evento 'focus' (da cui l'editor capisce quale card è in uso). Per le prove si
// fa scattare lo stesso, solo quando la pagina non ha il fuoco vero (con un utente al suo posto non cambia niente).
const SIMULA_FUOCO = `(() => {
  if (window.__simulaFuoco) return;
  window.__simulaFuoco = true;
  const vero = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (...a) {
    vero.apply(this, a);
    if (!document.hasFocus()) this.dispatchEvent(new FocusEvent('focus'));
  };
})()`;

async function primoPiano(finestre) {
  // (niente `app.focus()`: non si ruba il fuoco a quello che l'utente sta usando; basta la simulazione nella pagina)
  const f = finestre.controllo;
  if (f && !f.isDestroyed()) await f.webContents.executeJavaScript(SIMULA_FUOCO).catch(() => {});
  await aspetta(0.2);
}

export async function prova({ finestre, cartellaLog, parti = ['robustezza', 'brani', 'entrata', 'livelli', 'browser', 'impostazioni', 'ableton', 'neon', 'tempo', 'solidita', 'uscita'] }) {
  const righe = [];
  const scrivi = (r) => {
    console.log(`[prova] ${r}`);
    righe.push(r);
  };
  const stato = (ruolo) => chiedi(finestre[ruolo], 'globalThis.cutxStato?.()');
  const uiPronta = () => chiedi(finestre.controllo, '!!globalThis.cutxProva && !!document.querySelector(".cm-editor")');

  const pronti = await aspettaChe(async () => (await stato('live')) && (await stato('cuffia')) && (await uiPronta()));
  if (!pronti) {
    scrivi('ERRORE: le finestre non sono partite');
    return false;
  }
  const pid = (r) => finestre[r].webContents.getOSProcessId();
  scrivi(`processi: controllo ${pid('controllo')} · live ${pid('live')} · cuffia ${pid('cuffia')}`);
  await aspetta(2);
  await primoPiano(finestre);
  let ok = true;
  if (parti.includes('robustezza')) await (async () => {
    await chiedi(finestre.controllo, `cutxProva.avviaTest(${JSON.stringify(CODICE)})`);
    await aspetta(3); // si parte quando la sentinella è accesa e il click gira

    let prima = (await stato('live')).sentinella;
    let tardiPrima = (await stato('live')).tardi;

    async function fase(nome, azione, durata = FASE_S) {
      const cuffiaPrima = (await stato('cuffia'))?.sentinella;
      azione();
      await aspetta(durata);
      const live = await stato('live');
      const cuffia = await stato('cuffia');
      const s = live.sentinella;
      const d = (k) => s[k] - prima[k];
      // Una cuffia rinata riparte da zero: allora vale il conto nuovo.
      const dc = (k) => {
        if (!cuffia?.sentinella) return null;
        const delta = cuffia.sentinella[k] - (cuffiaPrima?.[k] ?? 0);
        return delta < 0 ? cuffia.sentinella[k] : delta;
      };
      const buona = d('mancati') === 0 && d('extra') === 0 && live.tardi === tardiPrima && d('sentiti') >= durata * 2 - 2;
      ok &&= buona;
      scrivi(
        `${buona ? 'OK   ' : 'FALLITO'} ${nome.padEnd(20)} live: click sentiti ${d('sentiti')}/${d('attesi')}, persi ${d('mancati')}, ` +
          `fuori tempo ${d('extra')}, tardi ${live.tardi - tardiPrima}, scarto max ${s.scartoMaxMs.toFixed(2)} ms, giro max ${live.giroMax.toFixed(0)} ms` +
          ` · cuffia: ${cuffia ? `sentiti ${dc('sentiti')}, persi ${dc('mancati')}` : 'ferma'}`,
      );
      prima = s;
      tardiPrima = live.tardi;
    }

    await fase('base', () => {});
    await fase('blocca interfaccia', () => chiedi(finestre.controllo, 'cutxProva.bloccaInterfaccia(5000)'));
    await fase('crasha interfaccia', () => finestre.controllo.webContents.forcefullyCrashRenderer(), FASE_S + 2);
    const tornata = await aspettaChe(uiPronta, 10);
    scrivi(`interfaccia ripartita: ${tornata ? 'sì' : 'NO'}`);
    ok &&= tornata;
    await fase('blocca cuffia', () => chiedi(finestre.controllo, 'document.getElementById("cuffia-blocca").click()'));
    await fase('crasha cuffia', () => finestre.cuffia.webContents.forcefullyCrashRenderer(), FASE_S + 2);

    // Il tempo lo comanda il live: la cuffia (che ha ancora setcpm(120/4)) deve seguirlo.
    const veloce = CODICE.replace('setcpm(120/4)', 'setcpm(140/4)');
    await fase('cambio tempo live', () => chiedi(finestre.controllo, `cutxProva.valuta('live', ${JSON.stringify(veloce)})`));
    const cps = (await stato('live')).cps;
    const cpsCuffia = (await stato('cuffia')).cps;
    const tempoOk = Math.abs(cps - 140 / 240) < 1e-9 && Math.abs(cpsCuffia - cps) < 1e-9;
    scrivi(`${tempoOk ? 'OK   ' : 'FALLITO'} tempo: live ${(cps * 240).toFixed(1)} BPM, cuffia ${(cpsCuffia * 240).toFixed(1)} BPM`);
    ok &&= tempoOk;

    // Un errore nel codice non ferma niente: il live continua col codice di prima.
    const errore = await chiedi(finestre.controllo, `cutxProva.valuta('live', 's("sine*4".gain(')`);
    scrivi(`${errore ? 'OK   ' : 'FALLITO'} codice sbagliato rifiutato: ${errore}`);
    ok &&= !!errore;
    await fase('dopo codice sbagliato', () => {});

    // Dopo tutto questo la cuffia deve essere tornata a tempo col live.
    await aspetta(2);
    const misure = await chiedi(finestre.controllo, 'cutxProva.misure()');
    const cuffia = await stato('cuffia');
    const st = misure?.stima;
    scrivi(
      `cuffia alla fine: ${cuffia?.codice ? 'suona' : 'MUTA'}, sfasamento stimato media ${st?.media?.toFixed(2)} ms, ` +
        `min ${st?.min?.toFixed(2)}, max ${st?.max?.toFixed(2)} (${st?.n ?? 0} click)`,
    );
    const sincro = !!cuffia?.codice && st?.media !== null && Math.abs(st?.media) < 5;
    ok &&= sincro;
    // Le scorciatoie, premute davvero sulla finestra.
    const premi = async (tasto, ...modificatori) => {
      const wc = finestre.controllo.webContents;
      wc.sendInputEvent({ type: 'keyDown', keyCode: tasto, modifiers: modificatori });
      wc.sendInputEvent({ type: 'keyUp', keyCode: tasto, modifiers: modificatori });
      await aspetta(1);
    };
    const controlla = (nome, vero) => {
      scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}`);
      ok &&= vero;
    };
    await premi('.', 'meta');
    controlla('⌘. ferma il test', !(await stato('live')).codice && !(await stato('cuffia')).codice);
    const pezzo = 'note("c3 e3 g3").s("triangle").gain(.05)';
    await chiedi(finestre.controllo, `cutxProva.scriviCue(${JSON.stringify(pezzo)})`);
    await premi('Return', 'meta');
    controlla('⌘↵ manda in cuffia', (await stato('cuffia')).codice === pezzo && !(await stato('live')).codice);
    await premi('Return', 'meta', 'shift');
    controlla('⇧⌘↵ manda live', (await stato('live')).codice === pezzo);
    await premi('K', 'meta');
    const spenta = (await stato('cuffia')).udibile === false;
    await premi('K', 'meta');
    controlla('⌘K spegne e riaccende la cuffia', spenta && (await stato('cuffia')).udibile === true);
    await premi('Backspace', 'meta', 'shift');
    controlla('⇧⌘⌫ toglie il live', !(await stato('live')).codice && (await stato('cuffia')).codice === pezzo);
    await premi('.', 'meta');
    controlla('⌘. ferma tutto', !(await stato('cuffia')).codice);

  })();
  // un errore dentro una prova è un fallimento, non un blocco
  const sicura = async (nome, fn) => {
    await primoPiano(finestre);
    return fn({ finestre, scrivi }).catch((e) => (scrivi(`FALLITO ${nome}: ${e.stack ?? e}`), false));
  };
  if (parti.includes('brani')) ok = (await sicura('brani', provaBrani)) && ok;
  if (parti.includes('entrata')) ok = (await sicura('entrata', provaEntrata)) && ok;
  if (parti.includes('livelli')) ok = (await sicura('livelli', provaLivelli)) && ok;
  if (parti.includes('browser')) ok = (await sicura('browser', provaBrowser)) && ok;
  if (parti.includes('impostazioni')) ok = (await sicura('impostazioni', provaImpostazioni)) && ok;
  if (parti.includes('ableton')) ok = (await sicura('ableton', provaAbleton)) && ok;
  if (parti.includes('neon')) ok = (await sicura('neon', provaNeon)) && ok;
  if (parti.includes('tempo')) ok = (await sicura('tempo', provaTempo)) && ok;
  if (parti.includes('solidita')) ok = (await sicura('solidita', provaSolidita)) && ok;
  if (parti.includes('uscita')) ok = (await sicura('uscita', provaUscita)) && ok;
  if (parti.includes('annulla')) ok = (await sicura('annulla', provaAnnulla)) && ok;
  if (parti.includes('pausa')) ok = (await sicura('pausa', provaPausa)) && ok;
  if (parti.includes('scrittura')) ok = (await sicura('scrittura', provaScrittura)) && ok;
  if (parti.includes('specchio-aspetto')) ok = (await sicura('specchio-aspetto', provaSpecchioAspetto)) && ok;
  if (parti.includes('controller')) ok = (await sicura('controller', provaController)) && ok;
  if (parti.includes('cuffia')) ok = (await sicura('cuffia', provaCuffia)) && ok;
  if (parti.includes('cuffia-aspetto')) ok = (await sicura('cuffia-aspetto', provaCuffiaAspetto)) && ok;
  if (parti.includes('testi')) ok = (await sicura('testi', provaTesti)) && ok;
  if (parti.includes('finestra')) ok = (await sicura('finestra', provaFinestra)) && ok;
  if (parti.includes('coda')) ok = (await sicura('coda', provaCoda)) && ok;
  if (parti.includes('dissolvenze')) ok = (await sicura('dissolvenze', provaDissolvenze)) && ok;

  scrivi(ok ? 'PROVA SUPERATA' : 'PROVA FALLITA');

  await mkdir(cartellaLog, { recursive: true });
  const file = path.join(cartellaLog, `prova-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.log`);
  await appendFile(file, righe.join('\n') + '\n');
  console.log(`[prova] log: ${file}`);
  return ok;
}

// Foto della postazione (electron . --foto=file.png): un pezzo live, uno in cuffia, poi lo scatto.
const FOTO_LIVE = `setcpm(140/4)
note("c2 [eb2 g2] c3 <bb1 f2>").s("sawtooth").lpf(800).gain(.0001)`;
const FOTO_CUE = `n("0 3 7 <10 12>").scale("C:minor")
  .s("triangle").room(.6).delay(.4).gain(.0001)`;

export async function foto({ finestre, file: fotoFile }) {
  const pronta = () => chiedi(finestre.controllo, '!!globalThis.cutxProva && !!document.querySelector(".cm-editor")');
  await aspettaChe(async () => (await chiedi(finestre.live, 'globalThis.cutxStato?.()')) && (await pronta()));
  await aspetta(1);
  await chiedi(finestre.controllo, `cutxProva.valuta('live', ${JSON.stringify(FOTO_LIVE)})`);
  await chiedi(finestre.controllo, `cutxProva.scriviCue(${JSON.stringify(FOTO_CUE)})`);
  await chiedi(finestre.controllo, `cutxProva.valuta('cuffia', ${JSON.stringify(FOTO_CUE)})`);
  // un livello in arrivo, a metà della scrittura a macchina
  await chiedi(finestre.controllo, `cutxProva.scriviCue(${JSON.stringify('// @sezione basso\nnote("<c1 c1 eb1 g0>*8").s("supersaw")\n  .lpf(sine.range(200, 900).slow(4)).gain(.0001)')}); cutxProva.scegliEntraTra(4)`);
  await finestre.controllo.webContents.executeJavaScript('cutxProva.goLive()');
  await chiedi(finestre.controllo, `cutxProva.scriviCue(${JSON.stringify(FOTO_CUE)}); cutxProva.scegliEntraTra(1)`);
  await aspetta(3);
  await chiedi(finestre.controllo, "cutxProva.posaGatto('lecca'); cutxProva.accendiInsegna()"); // così si vede anche l'insegna accesa
  await aspetta(1.5);
  const img = await finestre.controllo.webContents.capturePage();
  await writeFile(fotoFile, img.toPNG());
  console.log(`[foto] ${fotoFile}`);
  // Il browser: la guida con una funzione aperta
  await chiedi(finestre.controllo, `cutxProva.browser.helpAperti.add('lpf()'); cutxProva.browser.vai('help')`);
  await aspetta(0.5);
  await writeFile(fotoFile.replace(/\.png$/, '-help.png'), (await finestre.controllo.webContents.capturePage()).toPNG());
  console.log(`[foto] ${fotoFile.replace(/\.png$/, '-help.png')}`);
  // I progetti Ableton di Valerio (solo letti), se ci sono
  const progettiVeri = path.join(os.homedir(), 'Desktop', 'x1 Project');
  if (existsSync(progettiVeri)) {
    const prima = (await chiedi(finestre.controllo, 'window.cutx.preferenze()')).cartelleAbleton ?? [];
    await chiedi(finestre.controllo, `window.cutx.salvaPreferenze({ cartelleAbleton: [${JSON.stringify(progettiVeri)}] }); cutxProva.browser.vai('ableton')`);
    await aspetta(3);
    await writeFile(fotoFile.replace(/\.png$/, '-ableton.png'), (await finestre.controllo.webContents.capturePage()).toPNG());
    console.log(`[foto] ${fotoFile.replace(/\.png$/, '-ableton.png')}`);
    // il pannello di importazione su un progetto vero (x1 e Mayia)
    for (const [nome, sigla] of [['x1', 'x1'], ['Mayia u influeced me a bit maybe?', 'mayia']]) {
      await chiedi(finestre.controllo, `cutxProva.importa.apri({ nome: ${JSON.stringify(nome)}, percorso: ${JSON.stringify(path.join(progettiVeri, `${nome}.als`))}, cartella: ${JSON.stringify(progettiVeri)} })`);
      await aspetta(2.5);
      const f = fotoFile.replace(/\.png$/, `-importa-${sigla}.png`);
      await writeFile(f, (await finestre.controllo.webContents.capturePage()).toPNG());
      console.log(`[foto] ${f}`);
      await chiedi(finestre.controllo, `cutxProva.importa.chiudi()`);
    }
    await chiedi(finestre.controllo, `window.cutx.salvaPreferenze({ cartelleAbleton: ${JSON.stringify(prima)} })`);
  }
  await chiedi(finestre.controllo, `cutxProva.browser.vai('suoni')`);
  // Un brano aperto: intro live, melodia in cuffia, drop selezionata a metà.
  const cartella = path.join(stash.radice(), 'libreria');
  const file = 'foto_notte.cutx';
  await writeFile(path.join(cartella, file), NOTTE);
  const js = (codice) => chiedi(finestre.controllo, codice);
  await js(`cutxProva.cue.apri('${file}')`);
  await aspetta(0.8);
  await js(`(() => { const c = cutxProva.cue.carte.find((c) => c.i === 0); cutxProva.cue.attiva(c); })()`);
  await js(`(async () => { const p = cutxProva.cue.pezzo(); await cutxProva.valuta('live', p.codice, { nome: p.nome, provenienza: p.provenienza }); })()`);
  await js(`(() => { const c = cutxProva.cue.carte.find((c) => c.i === 1); cutxProva.cue.attiva(c); })()`);
  await js(`(async () => { const p = cutxProva.cue.pezzo(); await cutxProva.valuta('cuffia', p.codice, { nome: p.nome, provenienza: p.provenienza }); })()`);
  await aspetta(1.5);
  await writeFile(fotoFile.replace(/\.png$/, '-brano.png'), (await finestre.controllo.webContents.capturePage()).toPNG());
  console.log(`[foto] ${fotoFile.replace(/\.png$/, '-brano.png')}`);
  await js(`cutxProva.cue.brano = null; cutxProva.cue.cambiaModo('libero')`);
  await rm(path.join(cartella, file), { force: true });

  // La finestra di uscita, con quello che suona adesso
  await finestre.controllo.webContents.executeJavaScript('window.cutx.uscitaOnOff()');
  await aspetta(3);
  if (finestre.uscita) {
    const f = fotoFile.replace(/\.png$/, '-uscita.png');
    await writeFile(f, (await finestre.uscita.webContents.capturePage()).toPNG());
    console.log(`[foto] ${f}`);
    await finestre.controllo.webContents.executeJavaScript('window.cutx.uscitaOnOff()');
  }

  // E le impostazioni, aperte con ⌘,
  const wc = finestre.controllo.webContents;
  wc.sendInputEvent({ type: 'keyDown', keyCode: ',', modifiers: ['meta'] });
  await aspetta(1);
  const altro = fotoFile.replace(/\.png$/, '-impostazioni.png');
  await chiedi(finestre.controllo, `document.querySelector('#imp-nav [data-sez="scorciatoie"]').click()`);
  await aspetta(0.4);
  await writeFile(altro, (await wc.capturePage()).toPNG());
  console.log(`[foto] ${altro}`);
  await chiedi(finestre.controllo, `document.querySelector('#imp-nav [data-sez="stash"]').click()`);
  await aspetta(0.4);
  await writeFile(altro.replace('.png', '-stash.png'), (await wc.capturePage()).toPNG());
}

// --- prova dei brani: + sezione, salva, riapri, modifica, manda live, suoni mancanti ---

const NOTTE = `// @brano notte a mano
// @bpm 140
// @data 2020-01-01
// @suoni jungle_break
// preambolo
setcpm(140/4)

// @sezione intro
s("bd*4, ~ hh").gain(.0001)
// commento

// @sezione melodia · volume 0.6
n("0 3 7").scale("C:minor").s("triangle").gain(.0001)
// @sezione drop · volume 0.8 · muto
s("sine*8")
  .gain(.0001)
`;

async function provaBrani({ finestre, scrivi }) {
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}${!vero && dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  const js = (codice) => chiedi(finestre.controllo, codice);
  const premi = async (tasto, ...modificatori) => {
    const wc = finestre.controllo.webContents;
    wc.sendInputEvent({ type: 'keyDown', keyCode: tasto, modifiers: modificatori });
    wc.sendInputEvent({ type: 'keyUp', keyCode: tasto, modifiers: modificatori });
    await aspetta(0.6);
  };
  // scrive nel dialogo aperto e preme invio, come farei io
  const rispondi = async (valore) => {
    await aspetta(0.4);
    const fatto = await js(`(() => {
      const i = document.querySelector('.dialogo input');
      if (!i) return false;
      i.value = ${JSON.stringify(valore)};
      i.dispatchEvent(new Event('input'));
      i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return true;
    })()`);
    await aspetta(1);
    return fatto;
  };
  const cartella = path.join(stash.radice(), 'libreria');
  const leggi = (file) => readFile(path.join(cartella, file), 'utf8');
  const oggi = new Date().toLocaleDateString('sv-SE');
  const sigla = Date.now().toString(36);
  const creati = [];

  await premi('.', 'meta');

  // + sezione in modalità libero
  await js(`cutxProva.cue.cambiaModo('libero')`);
  await js(`cutxProva.scriviCue(${JSON.stringify('setcpm(130/4)\ns("prova_stem").gain(.0001)\nnote("c3 e3").s("triangle").gain(.0001)\nnote("g2").s("sine").gain(.0001)')})`);
  await js('cutxProva.selezionaRighe(2, 3)');
  await premi('E', 'meta');
  await rispondi('melodia');
  await js('cutxProva.selezionaRighe(1, 1)');
  await premi('E', 'meta');
  await rispondi('drum');
  const atteso = 'setcpm(130/4)\n// @sezione drum\ns("prova_stem").gain(.0001)\n// @sezione melodia\nnote("c3 e3").s("triangle").gain(.0001)\nnote("g2").s("sine").gain(.0001)';
  const libero = await js('cutxProva.cue.libero.codice');
  controlla('+ sezione (⌘E) crea le sezioni dalle righe scelte', libero === atteso, JSON.stringify(libero));

  // ⌘S: la prima volta chiede il nome
  const nome = `prova cutx ${sigla}`;
  await premi('S', 'meta');
  await rispondi(nome);
  const file = `prova_cutx_${sigla}.cutx`;
  creati.push(file);
  const salvato = await leggi(file).catch(() => null);
  const testaAttesa = `// @brano ${nome}\n// @bpm 130\n// @data ${oggi}\n// @suoni prova_stem\n`;
  controlla('⌘S salva il brano con nome, BPM, data e suoni dello stash', salvato === testaAttesa + atteso, JSON.stringify(salvato));
  controlla('il brano compare subito nella libreria', (await js('cutxProva.libreria()'))?.some((b) => b.file === file));

  // riaperto torna identico, con la mappa ricostruita
  await js(`cutxProva.cue.apri(${JSON.stringify(file)})`);
  await aspetta(0.8);
  controlla('riaperto è identico, byte per byte', (await js('cutxProva.cue.testoBrano()')) === salvato);
  const mappa = await js(`[...document.querySelectorAll('#mappa .blocco-mappa')].map((b) => b.textContent)`);
  controlla('la mappa si ricostruisce da sola', JSON.stringify(mappa) === JSON.stringify(['1 drum', '2 melodia']), JSON.stringify(mappa));

  // una modifica sulla card e ⌘S: cambia solo quello
  await js(`(() => { const c = cutxProva.cue.carte.find((c) => c.i === 1); c.editor.codice = c.editor.codice + '\\n// aggiunta'; c.editor.focus(); })()`);
  await premi('S', 'meta');
  const modificato = await leggi(file);
  controlla('in modalità brano ⌘S salva le modifiche delle card', modificato === salvato + '\n// aggiunta', JSON.stringify(modificato));

  // dalla card al live, col nome della sezione
  await premi('Return', 'meta', 'shift');
  await aspetta(1);
  const live = await chiedi(finestre.live, 'globalThis.cutxStato?.()');
  controlla('go live da una card manda la sezione col suo nome', live?.nome === 'melodia' && live?.provenienza === `${nome} §2`, JSON.stringify([live?.nome, live?.provenienza, await js('cutxProva.diagnosi()')]));
  await aspetta(0.5);
  const classi = await js(`[...document.querySelectorAll('#mappa .blocco-mappa')].map((b) => b.className)`);
  controlla('la mappa mostra la sezione live in verde', classi?.[1]?.includes('live'), JSON.stringify(classi));
  await premi('.', 'meta');

  // un file scritto a mano: riaperto e risalvato, sotto la testa non cambia niente
  const amano = `prova_a_mano_${sigla}.cutx`;
  creati.push(amano);
  await writeFile(path.join(cartella, amano), NOTTE);
  await js('cutxProva.cue.brano.sporco = false');
  await js(`cutxProva.cue.apri(${JSON.stringify(amano)})`);
  await aspetta(0.8);
  controlla('un brano scritto a mano si riapre identico', (await js('cutxProva.cue.testoBrano()')) === NOTTE);
  const mappaMano = await js(`[...document.querySelectorAll('#mappa .blocco-mappa')].map((b) => b.textContent)`);
  controlla('sezioni, ordine e nomi del brano a mano', JSON.stringify(mappaMano) === JSON.stringify(['1 intro', '2 melodia', '3 drop']), JSON.stringify(mappaMano));
  controlla('se mancano dei suoni lo dice subito', (await js(`document.getElementById('cue-avviso').textContent`))?.includes('jungle_break'));
  await js('cutxProva.cue.carte.find((c) => c.i === 0).editor.focus()');
  await premi('S', 'meta');
  const risalvato = await leggi(amano);
  const corpo = (t) => t.slice(t.indexOf('// preambolo'));
  controlla('risalvato: sotto la testa è identico', corpo(risalvato) === corpo(NOTTE));
  controlla('risalvato: la testa tiene il BPM e aggiorna data e suoni', risalvato.startsWith(`// @brano notte a mano\n// @bpm 140\n// @data ${oggi}\n// @suoni\n`), JSON.stringify(risalvato.slice(0, 90)));

  for (const f of creati) await rm(path.join(cartella, f), { force: true });
  await js(`cutxProva.cue.brano = null; cutxProva.cue.cambiaModo('libero')`);
  return ok;
}

// --- prova dell'entrata a tempo: GO LIVE, sostituzione, uscita, tempo nuovo, errori ---

async function provaEntrata({ finestre, scrivi }) {
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}${!vero && dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  const js = (codice) => chiedi(finestre.controllo, codice);
  const live = () => chiedi(finestre.live, 'globalThis.cutxStato?.()');
  const livello = async (id) => (await live())?.livelli?.find((l) => l.id === id);
  const premi = async (tasto, ...modificatori) => {
    const wc = finestre.controllo.webContents;
    wc.sendInputEvent({ type: 'keyDown', keyCode: tasto, modifiers: modificatori });
    wc.sendInputEvent({ type: 'keyUp', keyCode: tasto, modifiers: modificatori });
    await aspetta(0.3);
  };
  // manda live dal CUE libero il codice dato, entrando tra `cicli`
  const goLive = async (codice, cicli = 1) => {
    await js(`cutxProva.cue.cambiaModo('libero'); cutxProva.scriviCue(${JSON.stringify(codice)}); cutxProva.scegliEntraTra(${cicli})`);
    const wc = finestre.controllo.webContents;
    return wc.executeJavaScript('cutxProva.goLive().then((r) => r ?? { nulla: true }, (e) => ({ eccezione: String(e.stack ?? e) }))');
  };
  const ciclo = async () => (await live())?.ciclo ?? -Infinity;
  // aspetta che il live arrivi al ciclo c, ma non per sempre
  const finoAlCiclo = async (c, massimo = 25) => {
    const fine = Date.now() + massimo * 1000;
    while ((await ciclo()) < c) {
      if (Date.now() > fine) {
        scrivi(`FALLITO il live non arriva al ciclo ${c} (è a ${await ciclo()})`);
        ok = false;
        return false;
      }
      await aspetta(0.2);
    }
    return true;
  };

  await premi('.', 'meta');
  await js(`cutxProva.valuta('live', 'setcpm(120/4)')`); // 2 secondi a ciclo
  await premi('.', 'meta');
  await aspetta(0.5);

  // 1. entra al prossimo confine, e il primo suono è proprio lì
  const prima = await ciclo();
  const r1 = await goLive('// @sezione kick\ns("sine*4").freq(60).gain(.0001)', 1);
  controlla('GO LIVE risponde col ciclo di entrata, il prossimo confine', Number.isInteger(r1?.da) && r1.da > prima && r1.da - prima <= 1.2, JSON.stringify([prima, r1]));
  await finoAlCiclo(r1.da + 0.5);
  const l1 = await livello(r1.livello);
  controlla('il primo suono del livello cade esattamente sul ciclo di entrata', l1?.primo === r1.da, JSON.stringify(l1));

  // 2. entra tra 4 cicli (il tasto 4 vale fuori dall'editor: prima esc)
  await premi('Escape');
  await premi('4');
  const tasto4 = await js(`document.querySelector('[data-entra="4"]').classList.contains('on')`);
  const prima4 = await ciclo();
  const r4 = await goLive('// @sezione hat\ns("sine*8").freq(4000).gain(.0001)', 4);
  controlla('il tasto 4 sceglie "entra tra 4 cicli"', tasto4);
  controlla('entra tra 4 cicli: tre confini dopo il prossimo', r4?.da === Math.ceil(prima4 + 0.06) + 3 || r4?.da === Math.ceil(prima4) + 3, JSON.stringify([prima4, r4?.da]));
  await aspetta(2);
  const scritto = await js(`document.querySelector('#livelli .livello.in-arrivo .codice')?.textContent ?? null`);
  const intero = '// @sezione hat\ns("sine*8").freq(4000).gain(.0001)';
  controlla('mentre arriva, il codice si scrive a macchina', scritto !== null && scritto.length > 0 && scritto.length < intero.length, JSON.stringify(scritto));
  await js('cutxProva.scegliEntraTra(1)');

  // 3. un livello con lo stesso nome sostituisce il vecchio esattamente al confine
  const r2 = await goLive('// @sezione kick\ns("sine*2").freq(50).gain(.0001)', 1);
  const vecchio = await livello(r1.livello);
  controlla('stesso nome: il vecchio esce dove entra il nuovo', vecchio?.a === r2.da, JSON.stringify([vecchio?.a, r2.da]));
  await finoAlCiclo(r2.da + 0.6);
  const dopo = await live();
  const nuovo = dopo.livelli.find((l) => l.id === r2.livello);
  controlla('il vecchio non suona più dopo il confine, il nuovo sì', !dopo.livelli.some((l) => l.id === r1.livello) && nuovo?.primo === r2.da, JSON.stringify(dopo.livelli.map((l) => [l.id, l.primo, l.ultimo, l.a])));

  // 4. codice sbagliato: il live non cambia, l'errore si vede nel CUE
  const primaErr = JSON.stringify((await live()).livelli.map((l) => l.id));
  const re = await goLive('// @sezione kick\ns("sine*2".gain(', 1);
  const avviso = await js(`document.getElementById('cue-avviso').textContent`);
  controlla('codice sbagliato: il live resta com\'era e l\'errore si vede solo nel CUE', re?.errore && JSON.stringify((await live()).livelli.map((l) => l.id)) === primaErr && avviso.includes('live'), JSON.stringify([re, avviso]));

  // 5. togliere: esce a fine ciclo, cancellandosi (lo tolgo a inizio ciclo, così si vede uscire)
  await finoAlCiclo(Math.floor(await ciclo()) + 1.05);
  const c5 = await ciclo();
  await js(`cutxProva.togli(${r2.livello})`);
  await aspetta(0.3);
  const uscente = await livello(r2.livello);
  if (uscente?.a == null) scrivi(`  livelli: ${JSON.stringify((await live())?.livelli?.map((l) => [l.id, l.nome, l.da, l.a]))} · r2 ${r2.livello}`);
  controlla('togli: esce al prossimo confine', uscente?.a === Math.ceil(c5) || uscente?.a === Math.ceil(c5) + 1, JSON.stringify([c5, uscente?.a]));
  let inUscita = false;
  for (let i = 0; i < 8 && !inUscita; i++) {
    inUscita = await js(`!!document.querySelector('#livelli .livello.in-uscita')`);
    if (!inUscita) await aspetta(0.2);
  }
  controlla('mentre esce, il livello si vede in uscita', inUscita);
  const fineUscita = uscente?.a ?? 0;
  await finoAlCiclo(fineUscita + 0.5);
  const andato = !(await live()).livelli.some((l) => l.id === r2.livello);
  controlla('a fine ciclo il livello se ne è andato', andato);

  // 6. un livello che cambia tempo lo cambia esattamente quando entra
  const r6 = await goLive('// @sezione veloce\nsetcpm(150/4)\ns("sine*4").freq(70).gain(.0001)', 2);
  if (!r6?.da) {
    scrivi(`  go live non ha risposto: ${JSON.stringify(r6)} · ${await js(`document.getElementById('cue-avviso').textContent`)}`);
    return false;
  }
  const cpsPrima = (await live()).cps;
  await finoAlCiclo(r6.da + 0.3);
  const cpsDopo = (await live()).cps;
  controlla('setcpm in un livello cambia il tempo solo quando entra', Math.abs(cpsPrima - 0.5) < 1e-9 && Math.abs(cpsDopo - 150 / 240) < 1e-9, JSON.stringify([cpsPrima, cpsDopo]));
  const l6 = await livello(r6.livello);
  controlla('e il suo primo suono è sul ciclo di entrata', l6?.primo === r6.da, JSON.stringify(l6));

  await premi('.', 'meta');
  await js(`cutxProva.valuta('live', 'setcpm(120/4)')`);
  await premi('.', 'meta');
  return ok;
}

// --- prova dei livelli: volume, muto, note, griglia, modifica sul posto, jam, paracadute,
// salva il live, finestra di uscita ---

async function provaLivelli({ finestre, scrivi }) {
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}${!vero && dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  const js = (codice) => chiedi(finestre.controllo, codice);
  const live = () => chiedi(finestre.live, 'globalThis.cutxStato?.()');
  const attivi = async () => ((await live())?.livelli ?? []).filter((l) => l.a === null);
  const ciclo = async () => (await live())?.ciclo ?? -Infinity;
  const wc = () => finestre.controllo.webContents;
  const premi = async (tasto, ...modificatori) => {
    wc().sendInputEvent({ type: 'keyDown', keyCode: tasto, modifiers: modificatori });
    wc().sendInputEvent({ type: 'keyUp', keyCode: tasto, modifiers: modificatori });
    await aspetta(0.3);
  };
  // aspetta che fn() sia vero, al massimo s secondi
  const finche = async (fn, s = 6) => {
    for (let i = 0; i < s * 5; i++) {
      const r = await fn();
      if (r) return r;
      await aspetta(0.2);
    }
    return null;
  };
  const goLive = async (codice) => {
    await js(`cutxProva.cue.cambiaModo('libero'); cutxProva.scriviCue(${JSON.stringify(codice)}); cutxProva.scegliEntraTra(1)`);
    return wc().executeJavaScript('cutxProva.goLive()');
  };
  const rispondi = async (valore) => {
    await aspetta(0.4);
    await js(`(() => { const i = document.querySelector('.dialogo input'); i.value = ${JSON.stringify(valore)}; i.dispatchEvent(new Event('input')); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
    await aspetta(1);
  };

  await premi('.', 'meta');
  await js(`cutxProva.valuta('live', 'setcpm(120/4)')`);
  await premi('.', 'meta');

  const KICK = '// @sezione kick\ns("sine*4").freq(60).gain(.0001)';
  const MEL = '// @sezione melodia\nnote("c3 e3 g3 b3").s("triangle").gain(.0001)';
  const r1 = await goLive(KICK);
  const r2 = await goLive(MEL);
  await finche(async () => (await ciclo()) > Math.max(r1.da, r2.da) + 0.3, 8);

  // volume e muto
  await js(`cutxProva.pila.azioni.volume(${r1.livello}, 0.5)`);
  await aspetta(0.4);
  controlla('volume di un livello', (await attivi()).find((l) => l.id === r1.livello)?.volume === 0.5);
  const gainDi = async (id) => (await live())?.guadagni?.[id];
  controlla('il volume agisce sul guadagno del livello, subito', Math.abs((await gainDi(r1.livello)) - 0.5) < 0.02, String(await gainDi(r1.livello)));
  controlla('un livello non toccato resta a guadagno 1', Math.abs((await gainDi(r2.livello)) - 1) < 0.02, String(await gainDi(r2.livello)));
  // dentro l'editor ⌥ scrive (⌥5 è ~ sulla tastiera italiana): il muto non scatta
  await js(`cutxProva.cue.focus()`);
  await aspetta(0.3);
  await premi('1', 'alt');
  controlla('⌥1 dentro un editor non mette in muto', (await attivi())[0]?.muto === false, JSON.stringify((await attivi()).map((l) => [l.nome, l.muto])));
  controlla('⌥1 dentro un editor non cambia il guadagno', Math.abs((await gainDi(r1.livello)) - 0.5) < 0.02);
  await premi('Escape');
  await premi('1', 'alt');
  controlla('⌥1 fuori dall\'editor mette in muto il primo livello', (await attivi())[0]?.muto === true, JSON.stringify((await attivi()).map((l) => [l.nome, l.muto])));
  await aspetta(0.4);
  controlla('il muto porta il guadagno a zero, senza click', (await gainDi(r1.livello)) < 0.01, String(await gainDi(r1.livello)));
  await premi('1', 'alt');
  controlla('⌥1 di nuovo lo toglie dal muto', (await attivi())[0]?.muto === false);
  await aspetta(0.4);
  controlla('tolto dal muto il guadagno torna al volume', Math.abs((await gainDi(r1.livello)) - 0.5) < 0.02, String(await gainDi(r1.livello)));

  // note in verde e griglia
  const verde = await finche(() => js(`!!document.querySelector('#livelli .livello .codice .nota')`));
  controlla('le note che suonano si accendono in verde nel LIVE', verde);
  const colpi = await js(`document.querySelectorAll('#livelli .livello .griglia .colpo').length`);
  controlla('la griglia ritmica mostra i colpi', colpi >= 8, String(colpi));

  // in cuffia, in bianco nel CUE
  await js(`cutxProva.scriviCue(${JSON.stringify(MEL)})`);
  await js(`cutxProva.cue.libero.vaiAllaRiga(1)`);
  await premi('Return', 'meta');
  const bianco = await finche(() => js(`!!document.querySelector('#editor .cm-nota-cuffia')`));
  controlla('le note che suonano in cuffia si accendono in bianco nel CUE', bianco);
  await js(`cutxProva.cue.libero.codice = ''`);

  // modificare un livello sul posto
  const MEL2 = 'note("c3 eb3 g3 bb3").s("triangle").gain(.0001)';
  await js(`document.querySelector('#livelli .livello:nth-child(2) .codice').click()`);
  await aspetta(0.3);
  await js(`(() => { const m = cutxProva.pila.modifiche.get('melodia'); m.editor.codice = ${JSON.stringify(MEL2)}; m.editor.focus(); })()`);
  await aspetta(0.3);
  const segnato = await js(`document.querySelector('#livelli .livello.non-applicato .piede-carta')?.textContent ?? ''`);
  const ancoraVecchio = (await attivi()).find((l) => l.nome === 'melodia')?.codice.includes('e3 g3');
  controlla('modificando: si vede che ci sono modifiche, il live suona la versione di prima', segnato.includes('non applicate') && ancoraVecchio, segnato);
  // l'uscita vede la bozza mentre la scrivo
  await wc().executeJavaScript('window.cutx.uscitaOnOff()');
  const uscita = await finche(async () => finestre.uscita && (await chiedi(finestre.uscita, 'globalThis.cutxUscita?.()')), 10);
  const bozza = await finche(async () => (await chiedi(finestre.uscita, 'globalThis.cutxUscita?.()'))?.testo?.includes('eb3 g3 bb3'));
  controlla('la finestra di uscita si apre', !!uscita);
  controlla('sull\'uscita si vede quello che scrivo mentre lo scrivo', bozza);
  await premi('Return', 'meta');
  const applicata = await finche(async () => (await attivi()).find((l) => l.nome === 'melodia')?.codice === MEL2);
  const nuova = (await attivi()).find((l) => l.nome === 'melodia');
  controlla('⌘↵ applica la modifica al prossimo ciclo, senza macchina da scrivere', applicata && Number.isInteger(nuova?.da) && nuova?.scritto === true, JSON.stringify(nuova));

  // errore: resta la versione di prima, l'errore solo sul mio schermo
  await finche(async () => (await ciclo()) > nuova.da + 0.2, 6);
  await js(`document.querySelector('#livelli .livello:last-child .codice').click()`);
  await aspetta(0.3);
  await js(`(() => { const m = cutxProva.pila.modifiche.get('melodia'); m.editor.codice = 'note("c3".s('; m.editor.focus(); })()`);
  await premi('Return', 'meta');
  await aspetta(0.5);
  const erroreCarta = await js(`[...document.querySelectorAll('#livelli .livello .errore')].map((e) => e.textContent).join('')`);
  const testoUscita = (await chiedi(finestre.uscita, 'globalThis.cutxUscita?.()'))?.testo ?? '';
  controlla('codice sbagliato: il livello resta com\'era', (await attivi()).find((l) => l.nome === 'melodia')?.codice === MEL2);
  controlla('l\'errore si vede nella carta, mai sull\'uscita', erroreCarta.length > 0 && !/Unexpected|error/i.test(testoUscita), erroreCarta);
  // esc annulla e torna al codice che suona
  await premi('Escape');
  const chiusa = await js(`!document.querySelector('#livelli .livello.in-modifica')`);
  const mostrato = await js(`document.querySelector('#livelli .livello:last-child .codice').textContent`);
  controlla('esc annulla e torna al codice che sta suonando', chiusa && mostrato.includes('eb3 g3 bb3'), mostrato);

  // il jam
  await js(`(() => { const j = cutxProva.pila.jam.editor; j.codice = 's("sine*16").freq(8000).gain(.0001)'; j.focus(); })()`);
  await premi('Return', 'meta');
  const jam = await finche(async () => (await attivi()).find((l) => l.nome === 'jam'));
  controlla('il jam entra al prossimo ciclo con ⌘↵', jam?.provenienza === 'jam' && jam?.scritto === true, JSON.stringify(jam));
  await premi('Escape');

  // il paracadute: ⌘P due volte di fila
  const prima = (await attivi()).map((l) => l.nome).sort();
  wc().sendInputEvent({ type: 'keyDown', keyCode: 'P', modifiers: ['meta'] });
  wc().sendInputEvent({ type: 'keyUp', keyCode: 'P', modifiers: ['meta'] });
  await aspetta(0.1);
  wc().sendInputEvent({ type: 'keyDown', keyCode: 'P', modifiers: ['meta'] });
  wc().sendInputEvent({ type: 'keyUp', keyCode: 'P', modifiers: ['meta'] });
  const aperto = await finche(async () => (await live())?.paracadute);
  const dopoBattito = await finche(async () => {
    const a = await attivi();
    return a.length === 1 && a[0].nome === 'paracadute' && (await live()).livelli.every((l) => l.nome === 'paracadute' || l.a !== null);
  });
  const p = (await attivi())[0];
  controlla('paracadute: al battito successivo esce tutto ed entra il codice di emergenza', aperto && dopoBattito && (p?.da * 4) % 1 === 0, JSON.stringify(p));
  await premi('P', 'meta');
  // una pressione sola non fa niente
  await aspetta(0.7);
  controlla('una pressione sola di ⌘P non fa niente', (await live())?.paracadute === true);
  wc().sendInputEvent({ type: 'keyDown', keyCode: 'P', modifiers: ['meta'] });
  wc().sendInputEvent({ type: 'keyUp', keyCode: 'P', modifiers: ['meta'] });
  await aspetta(0.1);
  wc().sendInputEvent({ type: 'keyDown', keyCode: 'P', modifiers: ['meta'] });
  wc().sendInputEvent({ type: 'keyUp', keyCode: 'P', modifiers: ['meta'] });
  const tornati = await finche(async () => {
    const a = (await attivi()).map((l) => l.nome).sort();
    return JSON.stringify(a) === JSON.stringify(prima) && !(await live()).paracadute;
  }, 8);
  const rientrati = await attivi();
  controlla('di nuovo ⌘P ⌘P: tornano i livelli di prima, al prossimo ciclo, col loro volume', tornati && rientrati.every((l) => Number.isInteger(l.da)) && rientrati.find((l) => l.nome === 'kick')?.volume === 0.5, JSON.stringify(rientrati.map((l) => [l.nome, l.da, l.volume])));

  // salva il live come brano
  await finche(async () => {
    const c = await ciclo();
    return (await attivi()).every((l) => (l.da ?? 0) < c);
  }, 6);
  await js(`cutxProva.pila.azioni.muto((${JSON.stringify(await attivi())}).find((l) => l.nome === 'melodia').id, true)`);
  await aspetta(0.4);
  const sigla = Date.now().toString(36);
  wc().executeJavaScript('cutxProva.salvaLiveComeBrano()');
  await rispondi(`live prova ${sigla}`);
  const file = path.join(stash.radice(), 'libreria', `live_prova_${sigla}.cutx`);
  const salvato = await readFile(file, 'utf8').catch(() => '');
  const b = await import('../renderer/brano.js');
  const sezioni = b.leggi(salvato).sezioni;
  controlla('salva il live come brano: un livello per sezione, nell\'ordine di entrata', JSON.stringify(sezioni.map((x) => x.nome)) === JSON.stringify((await attivi()).map((l) => l.nome)), JSON.stringify(sezioni.map((x) => x.nome)));
  controlla('volume e muto salvati come informazioni della sezione', sezioni.find((x) => x.nome === 'kick')?.info.volume === 0.5 && sezioni.find((x) => x.nome === 'melodia')?.info.muto === true, JSON.stringify(sezioni.map((x) => x.info)));
  controlla('e compare nella libreria', (await js('cutxProva.libreria()'))?.some((x) => x.file === `live_prova_${sigla}.cutx`));
  await rm(file, { force: true });

  // l'uscita crasha: le casse non se ne accorgono e lei torna
  const tardiPrima = (await live()).tardi;
  finestre.uscita.webContents.forcefullyCrashRenderer();
  await aspetta(3);
  const tornata = await finche(async () => (await chiedi(finestre.uscita, 'globalThis.cutxUscita?.()'))?.livelli?.length > 0, 8);
  controlla('uscita crashata: torna da sola e il live non perde niente', tornata && (await live()).tardi === tardiPrima);
  await wc().executeJavaScript('window.cutx.uscitaOnOff()');
  await aspetta(0.5);
  controlla('l\'uscita si chiude e il live continua', !finestre.uscita && (await attivi()).length > 0);

  await premi('.', 'meta');
  await js(`cutxProva.pila.jam.editor.codice = ''`);
  return ok;
}

// --- prova del browser: suoni, libreria, help ---

async function provaBrowser({ finestre, scrivi }) {
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}${!vero && dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  const js = (codice) => chiedi(finestre.controllo, codice);
  const cartellaSuoni = path.join(stash.radice(), 'suoni', 'prova_cassa');
  const file = 'foto_browser.cutx';
  await mkdir(cartellaSuoni, { recursive: true });
  await writeFile(path.join(cartellaSuoni, 'a.wav'), wavSilenzio(3));
  await writeFile(path.join(cartellaSuoni, 'b.wav'), 'RIFF');
  await writeFile(path.join(stash.radice(), 'libreria', file), '// @brano browser\n// @bpm 100\n// @sezione uno\ns("sine")\n');
  try {
    await js('cutxProva.ricaricaStash()');
    await js('cutxProva.fermaTutto?.(); cutxProva.cue.cambiaModo("libero"); cutxProva.scriviCue("")');
    const righe = (sel = '#elenco .voce .nome') => js(`[...document.querySelectorAll('${sel}')].map((e) => e.textContent)`);

    await js('cutxProva.browser.vai("suoni")');
    const suoni = await righe();
    controlla('i suoni dello stash compaiono nel browser, con i synth', suoni.includes('prova_cassa') && suoni.includes('sawtooth'), JSON.stringify(suoni));
    await js(`(() => { const c = document.getElementById('cerca'); c.value = 'cassa'; c.dispatchEvent(new Event('input')); })()`);
    const trovati = await righe();
    controlla('la ricerca filtra i suoni', trovati.length === 1 && trovati[0] === 'prova_cassa', JSON.stringify(trovati));
    await js(`document.querySelector('#elenco .voce .nome.cliccabile').click()`);
    const varianti = await righe('#elenco .voce.variante .nome');
    controlla('un clic su un suono con più file mostra le varianti', varianti.length === 2, JSON.stringify(varianti));

    // + inserisce nel CUE, dove sta il cursore
    await js(`document.querySelector('#elenco .voce.variante button[data-aiuto="browser-inserisci"]').click()`);
    const inserito = await js('cutxProva.cue.libero.codice');
    controlla('+ inserisce il suono nel CUE', inserito.includes('s("prova_cassa:0")'), inserito);

    // ▶ lo fa sentire solo in cuffia
    await js(`(() => { const c = document.getElementById('cerca'); c.value = 'sine'; c.dispatchEvent(new Event('input')); })()`);
    await js(`document.querySelector('#elenco .voce button[data-aiuto="browser-prova"]').click()`);
    let cuffia = null;
    for (let i = 0; i < 20 && !cuffia?.codice; i++) {
      await aspetta(0.25);
      cuffia = await chiedi(finestre.cuffia, 'globalThis.cutxStato?.()');
    }
    controlla('▶ manda il suono in cuffia', cuffia?.codice?.includes('.s("sine")'), cuffia?.codice);
    const live = await chiedi(finestre.live, 'globalThis.cutxStato?.()');
    controlla('e non tocca le casse', !live.livelli?.length, JSON.stringify(live.livelli));
    controlla('il tasto diventa ■ mentre suona', (await js(`document.querySelector('#elenco .voce button.on')?.textContent`)) === '■');
    await js(`document.querySelector('#elenco .voce button.on').click()`);
    await aspetta(0.5);
    controlla('■ ferma la cuffia', !(await chiedi(finestre.cuffia, 'globalThis.cutxStato?.()')).codice);

    // un campione parte subito, suona una volta sola, e il ■ torna ▶ da solo quando finisce (dura 3 s: la sa dall'intestazione)
    await js(`(() => { const c = document.getElementById('cerca'); c.value = 'cassa'; c.dispatchEvent(new Event('input')); })()`);
    const stato = () => chiedi(finestre.cuffia, 'globalThis.cutxStato?.()');
    const prima = (await stato()).eventi;
    const t0 = Date.now();
    await js(`document.querySelector('#elenco .voce button[data-aiuto="browser-prova"]').click()`);
    let partito = null;
    for (let i = 0; i < 40 && partito === null; i++) {
      if ((await stato()).eventi > prima) partito = Date.now() - t0;
      else await aspetta(0.05);
    }
    controlla('▶ su un campione parte subito, non al ciclo dopo', partito !== null && partito < 600, `${partito} ms`);
    await aspetta(0.6);
    controlla('il tasto è ■ mentre suona', (await js(`document.querySelector('#elenco .voce button.on')?.textContent`)) === '■');
    let finito = null;
    for (let i = 0; i < 40 && finito === null; i++) {
      if (!(await stato()).codice) finito = Date.now() - t0;
      else await aspetta(0.25);
    }
    controlla('finisce da solo dopo la durata del file (3 s), non prima', finito !== null && finito >= 2500 && finito < 7000, `${finito} ms`);
    await aspetta(0.5);
    controlla('e il tasto torna ▶ senza che nessuno lo tocchi', (await js(`document.querySelector('#elenco .voce button.on')?.textContent ?? '▶'`)) === '▶');
    controlla('ha suonato una volta sola', (await stato()).eventi - prima === 1, String((await stato()).eventi - prima));
    // un secondo clic mentre suona lo ferma subito
    await js(`document.querySelector('#elenco .voce button[data-aiuto="browser-prova"]').click()`);
    await aspetta(0.8);
    await js(`document.querySelector('#elenco .voce button.on').click()`);
    await aspetta(0.5);
    controlla('un secondo clic lo ferma anche a metà', !(await stato()).codice);

    // libreria
    await js(`(() => { const c = document.getElementById('cerca'); c.value = ''; c.dispatchEvent(new Event('input')); })()`);
    await js('cutxProva.ricaricaLibreria().then(() => cutxProva.browser.vai("libreria"))');
    const brani = await righe();
    controlla('la libreria elenca i brani', brani.includes('browser'), JSON.stringify(brani));
    await js(`[...document.querySelectorAll('#elenco .voce.brano')].find((e) => e.textContent.startsWith('browser')).click()`);
    await aspetta(0.8);
    controlla('un clic carica il brano nel CUE', (await js('cutxProva.cue.brano?.file')) === file);
    await js(`cutxProva.cue.brano = null; cutxProva.cue.cambiaModo('libero')`);

    // help
    await js('cutxProva.browser.vai("help")');
    const gruppi = await js(`[...document.querySelectorAll('#elenco .gruppo')].map((e) => e.textContent)`);
    controlla('la guida ha i suoi gruppi', gruppi.length >= 6, JSON.stringify(gruppi));
    await js(`(() => { const c = document.getElementById('cerca'); c.value = 'lpf'; c.dispatchEvent(new Event('input')); })()`);
    controlla('la ricerca trova una funzione', (await js(`document.querySelectorAll('#elenco .funzione').length`)) >= 1);
    await js(`document.querySelector('#elenco .funzione .voce').click()`);
    controlla('un clic apre la spiegazione con un esempio', (await js(`!!document.querySelector('#elenco .funzione .esempio')`)) === true);
    await js(`document.querySelector('#elenco .esempio-tasti button[data-aiuto="browser-inserisci"]').click()`);
    controlla('+ inserisce l\'esempio nel CUE', (await js('cutxProva.cue.libero.codice')).includes('lpf('));
    // gli esempi si valutano tutti, senza errori
    const errori = await js(`(async () => {
      const e = [];
      for (const { nome, esempio } of cutxProva.esempiHelp()) {
        const r = await cutxProva.valutaCodice(esempio);
        if (r.errore) e.push(nome + ': ' + r.errore);
      }
      return e;
    })()`);
    controlla('tutti gli esempi della guida si valutano', errori.length === 0, errori.join(' | '));
    controlla('(e la valutazione sa dire quando un codice è sbagliato)', !!(await js(`cutxProva.valutaCodice('funzioneCheNonEsiste(1)')`)).errore);
    await js(`(() => { const c = document.getElementById('cerca'); c.value = ''; c.dispatchEvent(new Event('input')); })()`);
  } finally {
    await rm(cartellaSuoni, { recursive: true, force: true });
    await rm(path.join(stash.radice(), 'libreria', file), { force: true });
    await js('cutxProva.ricaricaStash()');
  }
  return ok;
}

// --- prova di help al passaggio, impostazioni e scorciatoie personalizzabili ---

async function provaImpostazioni({ finestre, scrivi }) {
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}${!vero && dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  const js = (codice) => chiedi(finestre.controllo, codice);
  const live = () => chiedi(finestre.live, 'globalThis.cutxStato?.()');
  const wc = () => finestre.controllo.webContents;
  const premi = async (tasto, ...modificatori) => {
    wc().sendInputEvent({ type: 'keyDown', keyCode: tasto, modifiers: modificatori });
    wc().sendInputEvent({ type: 'keyUp', keyCode: tasto, modifiers: modificatori });
    await aspetta(0.4);
  };
  const prefs = () => js('window.cutx.preferenze()');
  const sopra = async (selettore) => {
    const r = await js(`(() => { const r = document.querySelector(${JSON.stringify(selettore)}).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
    wc().sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y });
    return r;
  };
  const archiviaPreferenze = await prefs();

  try {
    await js('cutxProva.fermaTutto()');
    wc().focus(); // dopo il crash dell'interfaccia la finestra può non essere quella attiva
    // --- help al passaggio ---
    await js('window.cutx.salvaPreferenze({ suggerimenti: true, riquadroHelp: true })');
    await aspetta(0.4);
    wc().sendInputEvent({ type: 'mouseMove', x: 5, y: 5 });
    await sopra('#go-live');
    await aspetta(0.3);
    controlla('il riquadro help spiega subito quello che sta sotto il mouse', (await js(`document.getElementById('riquadro-help').textContent`)).includes('GO LIVE'));
    controlla('il suggerimento non compare prima di 800 ms', await js(`document.querySelector('.suggerimento').hidden`));
    await aspetta(1.0);
    const tip = await js(`(() => { const t = document.querySelector('.suggerimento'); return { visibile: !t.hidden, testo: t.textContent }; })()`);
    controlla('dopo il mouse fermo compare il suggerimento, con la scorciatoia', tip.visibile && tip.testo.includes('GO LIVE') && tip.testo.includes('⇧⌘↵'), JSON.stringify(tip));
    wc().sendInputEvent({ type: 'mouseMove', x: 5, y: 5 });
    await aspetta(0.3);
    controlla('muovendo il mouse sparisce', await js(`document.querySelector('.suggerimento').hidden`));
    controlla('e il riquadro torna al suo invito', (await js(`document.getElementById('riquadro-help').textContent`)).includes('Passa il mouse'));
    // un title nato dopo (i bottoni di una card) fa da riserva
    await premi('I', 'meta');
    const spenti = await prefs();
    controlla('⌘I spegne suggerimenti e riquadro', spenti.suggerimenti === false && spenti.riquadroHelp === false, JSON.stringify([spenti.suggerimenti, spenti.riquadroHelp]));
    controlla('il riquadro sparisce', await js(`document.getElementById('riquadro-help').hidden`));
    await sopra('#go-live');
    await aspetta(1.2);
    controlla('e il suggerimento non compare', await js(`document.querySelector('.suggerimento').hidden`));
    await premi('I', 'meta');
    const accesi = await prefs();
    controlla('⌘I di nuovo li riaccende', accesi.suggerimenti === true && accesi.riquadroHelp === true);
    wc().sendInputEvent({ type: 'mouseMove', x: 5, y: 5 });

    // --- impostazioni: aprono con ⌘, e hanno le sezioni ---
    await premi(',', 'meta');
    controlla('⌘, apre le impostazioni', (await js(`!document.getElementById('impostazioni').hidden`)) === true);
    const sezioni = await js(`[...document.querySelectorAll('#imp-nav [data-sez]')].map((b) => b.textContent)`);
    controlla('ci sono le sezioni della tavola', ['generale', 'audio', 'scorciatoie', 'proiezione', 'stash', 'estensioni'].every((x) => sezioni.includes(x)), JSON.stringify(sezioni));
    const vai = (n) => js(`document.querySelector('#imp-nav [data-sez="${n}"]').click()`);

    // --- scorciatoie rimappabili ---
    await vai('scorciatoie');
    const righe = await js(`document.querySelectorAll('#scorciatoie-elenco .imp-riga').length`);
    controlla('l\'elenco ha tutte le azioni', righe === 25, String(righe)); // (20 + cuffia in pausa, sfondo, annulla e rifai del set, scelta del livello)
    const cap = (id) => `#scorciatoie-elenco [data-azione="${id}"] .cap-gruppo`;
    await js(`document.querySelector('${cap('goLive')}').click()`);
    controlla('un clic sul tasto aspetta la combinazione nuova', (await js(`document.querySelector('#scorciatoie-elenco [data-azione="goLive"]').textContent`)).includes('premi un tasto'));
    await premi('Return', 'meta'); // già di "prova in cuffia"
    const errore = await js(`document.querySelector('#scorciatoie-elenco [data-azione="goLive"]').textContent`);
    controlla('una combinazione già usata avvisa e non cambia', errore.includes('già usata') && !(await prefs()).scorciatoie.goLive, errore);
    await premi('C', 'meta');
    controlla('una combinazione riservata a macOS si rifiuta', (await js(`document.querySelector('#scorciatoie-elenco [data-azione="goLive"]').textContent`)).includes('riservata'));
    await premi('G', 'meta');
    controlla('la combinazione nuova si salva', (await prefs()).scorciatoie.goLive === 'Meta+KeyG', JSON.stringify((await prefs()).scorciatoie));
    controlla('e il tasto mostra la nuova combinazione', (await js(`document.querySelector('#scorciatoie-elenco [data-azione="goLive"]').textContent`)).includes('G'));
    await premi('Escape'); // chiude le impostazioni

    // la combinazione nuova fa go live, la vecchia no
    await js(`cutxProva.cue.cambiaModo('libero'); cutxProva.scriviCue('setcpm(120/4)\\ns("sine*2").gain(.0001)'); cutxProva.scegliEntraTra(1); cutxProva.cue.focus()`);
    await js(`cutxProva.valuta('live', 'setcpm(120/4)')`);
    await js(`cutxProva.fermaTutto()`);
    await aspetta(0.5);
    await premi('Return', 'meta', 'shift');
    await aspetta(0.6);
    controlla('la vecchia combinazione non fa più go live', ((await live()).livelli ?? []).length === 0);
    await premi('G', 'meta');
    await aspetta(1.2);
    controlla('la nuova fa go live, anche dentro l\'editor', ((await live()).livelli ?? []).filter((l) => l.a === null).length === 1);
    await js(`cutxProva.fermaTutto()`);

    // ripristina
    await premi(',', 'meta');
    await vai('scorciatoie');
    await js(`document.getElementById('scorciatoie-ripristina').click()`);
    await aspetta(0.5);
    controlla('ripristina rimette i tasti predefiniti', Object.keys((await prefs()).scorciatoie).length === 0);
    await js(`document.querySelector('#scorciatoie-elenco [data-azione="muto"] .cap-gruppo').click()`);
    await premi('5'); // niente modificatore
    controlla('il muto vuole un modificatore e una cifra', (await js(`document.querySelector('#scorciatoie-elenco [data-azione="muto"]').textContent`)).includes('modificatore'));
    await premi('Escape');
    await premi('Escape');

    // --- proiezione: gatto e insegna ---
    await premi(',', 'meta');
    await vai('proiezione');
    const interruttori = await js(`document.querySelectorAll('#imp-proiezione .imp-riga').length`);
    controlla('la proiezione ha i suoi interruttori (con «apri all\'avvio») e la scelta dello sfondo', interruttori === 6, String(interruttori));
    await js(`document.querySelectorAll('#imp-proiezione .imp-riga')[2].querySelectorAll('button')[1].click()`); // gatto off
    await aspetta(0.5);
    controlla('gatto off: sparisce dalla barra', (await prefs()).gatto === false && (await js(`getComputedStyle(document.querySelector('.barra .gatto-posto')).display`)) === 'none');
    await js(`document.querySelector('#imp-testi [data-voce="neon"] .segmenti').querySelectorAll('button')[1].click()`); // insegna off (nei testi per il pubblico)
    await aspetta(0.4);
    controlla('insegna off: sparisce', (await js(`getComputedStyle(document.getElementById('insegna')).display`)) === 'none');
    await js(`window.cutx.salvaPreferenze({ gatto: true, insegna: true })`);
    await aspetta(0.4);
    controlla('e tornano', (await js(`getComputedStyle(document.querySelector('.barra .gatto-posto')).display`)) !== 'none');

    // --- generale: frase ---
    await vai('generale');
    await js(`[...document.querySelectorAll('#imp-frase button')].find((b) => b.textContent === '8').click()`);
    await aspetta(0.5);
    controlla('la lunghezza della frase si cambia', (await prefs()).lunghezzaFrase === 8 && (await js(`document.getElementById('frase-lunghezza').textContent`)) === '/8');
    await js(`window.cutx.salvaPreferenze({ lunghezzaFrase: 16 })`);

    // --- stash: il paracadute del set ---
    await vai('stash');
    const file = path.join(stash.radice(), 'stash.json');
    const letto = async () => JSON.parse(await readFile(file, 'utf8')).paracadute;
    const prima = await letto();
    await js(`cutxProva.imp.editorParacadute.codice = '// paracadute di prova\\ns("sine*2").gain(.0001)'`);
    await aspetta(1.5);
    controlla('il paracadute scritto nelle impostazioni si salva in stash.json', (await letto()) === '// paracadute di prova\ns("sine*2").gain(.0001)', JSON.stringify(await letto()));
    await js(`document.getElementById('paracadute-predefinito').click()`);
    await aspetta(1);
    controlla('ripristina il predefinito lo toglie dallo stash', !(await letto()), JSON.stringify(await letto()));
    await premi('Escape');
    controlla('esc chiude le impostazioni', (await js(`document.getElementById('impostazioni').hidden`)) === true);
    if (prima) await js(`cutxProva.imp.dati.salvaConfig({ paracadute: ${JSON.stringify(prima)} })`);
  } finally {
    await js(`window.cutx.salvaPreferenze(${JSON.stringify({ scorciatoie: archiviaPreferenze.scorciatoie ?? {}, suggerimenti: archiviaPreferenze.suggerimenti ?? true, riquadroHelp: archiviaPreferenze.riquadroHelp ?? true, gatto: true, insegna: true, scritturaAMacchina: true, lunghezzaFrase: archiviaPreferenze.lunghezzaFrase })})`);
  }
  return ok;
}

// --- prova dell'importazione da Ableton ---

// Un progetto finto che ha un po' di tutto: MIDI, batteria, audio con warp, Session.
function progettoFinto() {
  const { clipMidi, clipAudio, note, tracciaMidi, tracciaAudio, drumRack } = finto;
  const basso = (inizio, tasti) => clipMidi({ inizio, loop: [0, 16], note: tasti.map((k, i) => note(i * 4, 4, k)) });
  const kit = drumRack([{ nome: 'Kick', ricezione: 92 }, { nome: 'Snare', ricezione: 88 }, { nome: 'Hihat Closed', ricezione: 82 }]);
  return finto.als({
    bpm: 140,
    tracce: [
      tracciaMidi({ nome: '1-Dark Pad', clip: [basso(0, [60, 63, 67, 70]), basso(32, [58, 62, 65, 69])] }),
      tracciaMidi({ nome: '2-Wonk Bass', clip: [basso(16, [38, 43, 36, 41])] }),
      tracciaMidi({ nome: '3-Kit', strumento: kit, clip: [clipMidi({ inizio: 0, loop: [0, 8], note: [note(0, 0.25, 36), note(4, 0.25, 36), note(2, 0.25, 40), note(1, 0.25, 46), note(1.5, 0.25, 46)] })] }),
      tracciaMidi({ nome: '4-Arp', clip: [clipMidi({ loop: [0, 4], note: [note(0, 0.5, 72), note(0.5, 0.5, 76), note(1, 0.5, 79), note(1.5, 0.5, 76)] })], sessione: [clipMidi({ loop: [0, 2], note: [note(0, 1, 60), note(1, 1, 67)] })] }),
      tracciaAudio({ nome: '5-Audio', clip: [clipAudio({ inizio: 0, loop: [0, 8], marcatori: [[0, 0], [8, 3.4]], durata: 4, file: 'Samples/loop.wav' })] }),
    ],
  });
}

// Un WAV di silenzio, valido (per le prove: dura `secondi`).
function wavSilenzio(secondi, frequenza = 8000) {
  const dati = Buffer.alloc(secondi * frequenza * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + dati.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(frequenza, 24);
  h.writeUInt32LE(frequenza * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(dati.length, 40);
  return Buffer.concat([h, dati]);
}

async function provaAbleton({ finestre, scrivi }) {
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}${!vero && dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  const js = (codice) => chiedi(finestre.controllo, codice);
  const premi = async (tasto, ...modificatori) => {
    finestre.controllo.webContents.sendInputEvent({ type: 'keyDown', keyCode: tasto, modifiers: modificatori });
    finestre.controllo.webContents.sendInputEvent({ type: 'keyUp', keyCode: tasto, modifiers: modificatori });
    await aspetta(0.4);
  };
  const progetti = [{ nome: 'progetto finto', modello: leggiAls(progettoFinto()) }];
  // i progetti veri di Valerio, se ci sono (solo letti, mai scritti)
  for (const f of ['x1.als', 'Mayia u influeced me a bit maybe?.als']) {
    const p = path.join(os.homedir(), 'Desktop', 'x1 Project', f);
    if (existsSync(p)) progetti.push({ nome: f, modello: await leggiAlsFile(p) });
  }
  for (const { nome, modello } of progetti) {
    const r = converti(modello, undefined, { titolo: 'prova', data: '2026-01-01' });
    controlla(`${nome}: produce delle sezioni`, r.sezioni.length > 0, String(r.sezioni.length));
    // ogni sezione, col suo preambolo, si valuta con Strudel senza errori
    const codici = r.sezioni.map((s) => `setcpm(${modello.bpm}/4)\n${s.codice}`);
    const sbagliate = await js(`(async () => {
      const e = [];
      for (const codice of ${JSON.stringify(codici)}) {
        const r = await cutxProva.valutaCodice(codice);
        if (r.errore) e.push(r.errore + ' ← ' + codice.slice(0, 80));
      }
      return e;
    })()`);
    controlla(`${nome}: ogni sezione si valuta con Strudel (${codici.length})`, sbagliate.length === 0, sbagliate.slice(0, 3).join(' | '));
  }

  // le cartelle dei progetti, nelle impostazioni
  const radice = await mkdtemp(path.join(os.tmpdir(), 'cutx-prova-als-'));
  const prima = (await js('window.cutx.preferenze()')).cartelleAbleton ?? [];
  try {
    await mkdir(path.join(radice, 'Uno Project', 'Backup'), { recursive: true });
    await writeFile(path.join(radice, 'Uno Project', 'uno.als'), progettoFinto());
    await writeFile(path.join(radice, 'Uno Project', 'Backup', 'uno [vecchio].als'), progettoFinto());
    await writeFile(path.join(radice, 'Uno Project', 'due.als'), progettoFinto());
    await js(`window.cutx.salvaPreferenze({ cartelleAbleton: [${JSON.stringify(radice)}] })`);
    await js(`document.getElementById('impostazioni').hidden = false; document.querySelector('#imp-nav [data-sez="ableton"]').click()`);
    await aspetta(1);
    const riga = await js(`document.querySelector('#imp-ableton .imp-riga')?.textContent ?? ''`);
    controlla('le impostazioni elencano la cartella e i suoi progetti (senza Backup)', riga.includes('2 progetti'), riga);
    const elenco = await js('window.cutx.progettiAbleton()');
    controlla('la scansione dà nome, cartella e data', elenco.length === 2 && elenco.every((p) => p.nome && p.cartella && p.modificato), JSON.stringify(elenco.map((p) => p.nome)));

    // la scheda ableton del browser: nome, BPM e tracce; un file rotto è "illeggibile"
    await writeFile(path.join(radice, 'Uno Project', 'rotto.als'), 'non è un progetto');
    // un progetto con un file audio che c'è e uno che manca
    const { clipAudio, tracciaAudio } = finto;
    await mkdir(path.join(radice, 'Uno Project', 'Samples'), { recursive: true });
    await writeFile(path.join(radice, 'Uno Project', 'Samples', 'loop.wav'), wavSilenzio(4));
    await writeFile(path.join(radice, 'Uno Project', 'tre.als'), finto.als({ bpm: 140, tracce: [
      finto.tracciaMidi({ nome: '1-Dark Pad', clip: [finto.clipMidi({ inizio: 0, loop: [0, 16], note: [finto.note(0, 4, 60), finto.note(4, 4, 63), finto.note(8, 4, 67), finto.note(12, 4, 70)] })] }),
      finto.tracciaMidi({ nome: '2-Basso', clip: [finto.clipMidi({ inizio: 16, loop: [0, 16], note: [finto.note(0, 4, 38), finto.note(4, 4, 43), finto.note(8, 4, 36), finto.note(12, 4, 41)] })] }),
      tracciaAudio({ nome: '3-Audio', clip: [clipAudio({ inizio: 0, loop: [0, 8], marcatori: [[0, 0], [8, 3.4]], durata: 4, file: 'Samples/loop.wav' })] }),
      tracciaAudio({ nome: '4-Audio', clip: [clipAudio({ inizio: 8, loop: [0, 4], marcatori: [[0, 0], [4, 1.7]], durata: 2, file: 'Samples/manca.wav', assoluto: '/non/esiste/manca.wav' })] }),
    ] }));
    await js(`document.getElementById('impostazioni').hidden = true; cutxProva.browser.vai('ableton')`);
    let righe = [];
    for (let i = 0; i < 40 && !righe.some((r) => r.includes('140 bpm')); i++) {
      await aspetta(0.25);
      righe = await js(`[...document.querySelectorAll('#elenco .voce.progetto')].map((e) => e.textContent)`);
    }
    controlla('la scheda ableton elenca i progetti con BPM e tracce', righe.some((r) => r.startsWith('uno') && r.includes('140 bpm · 5 tracce')), JSON.stringify(righe));
    controlla('un file che non si legge è segnato illeggibile', righe.some((r) => r.startsWith('rotto') && r.includes('illeggibile')), JSON.stringify(righe));
    await js(`(() => { const c = document.getElementById('cerca'); c.value = 'du'; c.dispatchEvent(new Event('input')); })()`);
    controlla('la ricerca filtra i progetti', (await js(`document.querySelectorAll('#elenco .voce.progetto').length`)) === 1);
    await js(`(() => { const c = document.getElementById('cerca'); c.value = ''; c.dispatchEvent(new Event('input')); })()`);
    const fuori = await js(`window.cutx.infoAbleton('/etc/passwd.als')`);
    controlla('un progetto fuori dalle cartelle scelte non si legge', !!fuori.errore, JSON.stringify(fuori));

    // il pannello di importazione
    const conta = (sel) => js(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
    const testo = (sel) => js(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? ''`);
    await js(`[...document.querySelectorAll('#elenco .voce.progetto')].find((e) => e.textContent.startsWith('tre')).click()`);
    for (let i = 0; i < 40 && !(await conta('#importa-tracce .traccia')); i++) await aspetta(0.25);
    controlla('un clic su un progetto apre il pannello', (await js(`!document.getElementById('importa').hidden`)) === true);
    controlla('il pannello mostra nome, tempo e tracce', (await testo('#importa-nome')) === 'tre' && (await testo('#importa-progetto')).includes('140 bpm') && (await conta('#importa-tracce .traccia')) === 4);
    // il percorso in tre passi
    const passi = await js(`[...document.querySelectorAll('#importa-passi .passo')].map((b) => b.textContent.replace(/\\s+/g, ' ').trim())`);
    controlla('in alto ci sono i tre passi: 1 progetto, 2 tracce, 3 importa', JSON.stringify(passi) === JSON.stringify(['1 progetto', '2 tracce', '3 importa']), JSON.stringify(passi));
    const visibile = (sel) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && !e.hidden && e.getBoundingClientRect().width > 0; })()`);
    controlla('si parte dal passo 1: il progetto, con avanti', (await visibile('#importa-p1')) && !(await visibile('#importa-p2')) && (await visibile('#importa-avanti')) && !(await visibile('#importa-vai')) && !(await visibile('#importa-indietro')));
    controlla('il passo 1 dice cosa succede', (await testo('#importa-progetto')).includes('non lo modifica mai'));
    await js(`document.getElementById('importa-avanti').click()`);
    controlla('avanti porta alle tracce', (await visibile('#importa-p2')) && !(await visibile('#importa-p1')) && (await visibile('#importa-indietro')));
    await js(`document.getElementById('importa-avanti').click()`);
    controlla('e poi a importa, dove c\'è il pulsante importa', (await visibile('#importa-p3')) && (await visibile('#importa-vai')) && !(await visibile('#importa-avanti')));
    await js(`document.querySelectorAll('#importa-passi .passo')[1].click()`);
    controlla('i passi in alto si possono cliccare per tornare indietro', await visibile('#importa-p2'));
    controlla('la riga dei file mancanti sta in cima, sopra le pagine', (await js(`document.getElementById('importa-mancanti').getBoundingClientRect().bottom <= document.getElementById('importa-p2').getBoundingClientRect().top + 1`)) === true);
    controlla('e il brano che ne esce: una sezione per traccia', (await conta('#importa-sezioni .sezione-riga')) === 4, String(await conta('#importa-sezioni .sezione-riga')));
    controlla('un file che non c\'è è segnalato, con il consiglio di Ableton', (await js(`!document.getElementById('importa-mancanti').hidden`)) && (await testo('#importa-mancanti')).includes('Raccogli tutto'), await testo('#importa-mancanti'));
    controlla('i limiti sono scritti nel pannello', (await testo('#importa-limiti')).includes('time-stretch'));

    // chiarezza: nomi dal file, selettore solo dove si sceglie, "vedi codice" staccato, nome del brano intero
    const nomiSezioni = await js(`[...document.querySelectorAll('#importa-sezioni .nome-sezione')].map((i) => i.value)`);
    controlla('le sezioni audio prendono il nome del file, non "audio N"', nomiSezioni.includes('loop') && nomiSezioni.includes('manca'), JSON.stringify(nomiSezioni));
    controlla('sotto ogni traccia audio c\'è il nome del file che usa', (await js(`[...document.querySelectorAll('#importa-tracce .traccia-file')].map((e) => e.textContent).join('|')`)).includes('file: loop.wav'));
    controlla('sulle tracce audio la modalità è testo, non un pulsante', (await js(`(() => { const t = document.querySelectorAll('#importa-tracce .traccia')[2]; return t.querySelectorAll('.modo').length === 0 && !!t.querySelector('.modo-testo'); })()`)) === true);
    controlla('sulle tracce MIDI il selettore ha due opzioni', (await js(`document.querySelectorAll('#importa-tracce .traccia')[0].querySelectorAll('.modo').length`)) === 2);
    await js('cutxProva.importa.vai(3)');
    controlla('"vedi codice" è un pulsante staccato dal tipo, che è un\'etichetta', (await js(`(() => { const r = document.querySelector('#importa-sezioni .sezione-riga'); const b = r.querySelector('button.apri-codice'); const e = r.querySelector('.tipo-sezione'); return b.textContent === 'vedi codice ▾' && e.tagName === 'SPAN' && !e.matches('button') && b.getBoundingClientRect().left - e.getBoundingClientRect().right > 100; })()`)) === true);
    await js(`(() => { const i = document.getElementById('importa-titolo'); i.value = 'mayia u influeced me a bit maybe'; i.dispatchEvent(new Event('change')); })()`);
    controlla('il nome del brano si legge tutto, senza tagli', (await js(`(() => { const i = document.getElementById('importa-titolo'); return i.scrollWidth <= i.clientWidth && i.value === 'mayia u influeced me a bit maybe'; })()`)) === true);
    await js(`(() => { const i = document.getElementById('importa-titolo'); i.value = 'tre'; i.dispatchEvent(new Event('change')); })()`);
    await js('cutxProva.importa.vai(2)');
    // sceglie: togliere una traccia, cambiare il synth, cambiare nome
    await js(`document.querySelectorAll('#importa-tracce .traccia')[1].querySelector('.casella').click()`);
    controlla('togliere una traccia toglie la sua sezione', (await conta('#importa-sezioni .sezione-riga')) === 3);
    await js(`document.querySelectorAll('#importa-tracce .traccia')[1].querySelector('.casella').click()`);
    await js(`(() => { const s = document.querySelectorAll('#importa-tracce .traccia')[0].querySelector('select.synth'); s.value = 'lead'; s.dispatchEvent(new Event('change')); })()`);
    controlla('il synth si cambia dal menu', (await js('cutxProva.importa.risultato().testo')).includes('.s("square")'));
    await js(`(() => { const i = document.querySelector('#importa-sezioni .nome-sezione'); i.value = 'intro'; i.dispatchEvent(new Event('change')); })()`);
    const testoBrano = await js('cutxProva.importa.risultato().testo');
    controlla('il nome di una sezione si cambia', testoBrano.includes('// @sezione intro') && testoBrano.includes('// @origine '), testoBrano.slice(0, 200));
    await js(`(() => { const i = document.getElementById('importa-titolo'); i.value = 'tre notti'; i.dispatchEvent(new Event('change')); })()`);
    controlla('il nome del brano si cambia', (await js('cutxProva.importa.risultato().testo')).startsWith('// @brano tre notti'));

    // MIDI come audio: stem, e il promemoria "dalla battuta 1"
    const modi = await js(`[...document.querySelectorAll('#importa-tracce .traccia')[1].querySelectorAll('.modo')].map((b) => b.textContent)`);
    controlla('la modalità si sceglie con parole normali', JSON.stringify(modi) === JSON.stringify(['synth di CUTX (le note, modificabili)', 'audio di Ableton (il suono originale)']), JSON.stringify(modi));
    controlla('sotto, una riga dice cosa succede con la scelta fatta', (await js(`document.querySelectorAll('#importa-tracce .traccia')[1].querySelector('.traccia-effetto').textContent`)).includes('codice Strudel col synth'));
    await js(`document.querySelectorAll('#importa-tracce .traccia')[1].querySelector('.modo[data-modo="audio"]').click()`);
    controlla('una traccia MIDI in modalità audio chiede lo stem e ricorda la battuta 1', (await conta('#importa-tracce .stem-riga')) === 1 && (await testo('#importa-tracce .stem-nota')).includes('battuta 1'));
    controlla('e la riga dice che senza stem resta il synth', (await js(`document.querySelectorAll('#importa-tracce .traccia')[1].querySelector('.traccia-effetto').textContent`)).includes('Scegli lo stem'));
    await js(`document.querySelectorAll('#importa-tracce .traccia')[1].querySelector('.modo[data-modo="codice"]').click()`);

    // ▶ in cuffia: parte subito, col tempo del progetto, mai nelle casse; torna ▶ da solo quando finisce
    const cuffiaStato = () => chiedi(finestre.cuffia, 'globalThis.cutxStato?.()');
    const prima0 = (await cuffiaStato()).eventi;
    const t0 = Date.now();
    await js(`document.querySelectorAll('#importa-tracce .traccia')[0].querySelector('.variante-riga button.key').click()`);
    let c = null;
    let ms = null;
    for (let i = 0; i < 40; i++) {
      c = await cuffiaStato();
      if (c.eventi > prima0) {
        ms = Date.now() - t0;
        break;
      }
      await aspetta(0.05);
    }
    controlla('▶ parte subito, non al ciclo dopo (primo suono programmato entro mezzo secondo)', ms !== null && ms < 600, `${ms} ms`);
    controlla('▶ su una sezione di codice la manda in cuffia, al tempo del progetto', c?.codice?.startsWith('setcpm(140/4)') && c.codice.includes('note('), c?.codice);
    controlla('e il tasto diventa ■', (await testo('#importa-tracce .traccia .variante-riga button.key.on')) === '■');
    await js(`document.querySelector('#importa-tracce .traccia .variante-riga button.key.on').click()`);
    await aspetta(0.5);
    controlla('■ ferma la cuffia', !(await cuffiaStato()).codice);
    await js(`document.querySelectorAll('#importa-tracce .traccia')[2].querySelector('.variante-riga button.key').click()`);
    await aspetta(1.2);
    c = await cuffiaStato();
    controlla('▶ su un audio lo manda in cuffia col suo file (nome provvisorio)', c?.codice?.includes('s("ant_') && !c.errore, JSON.stringify([c?.codice, c?.errore]));
    controlla('l\'audio mancante non si può ascoltare', (await js(`document.querySelectorAll('#importa-tracce .traccia')[3].querySelector('.variante-riga button.key').disabled`)) === true);
    controlla('le casse non sentono niente', !(((await chiedi(finestre.live, 'globalThis.cutxStato?.()')).livelli ?? []).length));
    // suona una volta sola e finisce: il motore si svuota e il tasto torna ▶ senza che nessuno lo tocchi
    let finita = false;
    for (let i = 0; i < 40 && !finita; i++) {
      await aspetta(0.25);
      finita = !(await cuffiaStato()).codice;
    }
    await aspetta(0.5);
    controlla('a fine anteprima la cuffia si ferma da sola', finita);
    controlla('e il tasto torna ▶ da solo', (await js(`document.querySelectorAll('#importa-tracce .traccia')[2].querySelector('.variante-riga button.key').textContent`)) === '▶');

    // un file mancante si indica a mano: lo si simula passando dal dialogo, che qui non si può automatizzare
    const mancanti = await conta('#importa-mancanti .mancante');
    controlla('il file mancante è elencato con "cerca…"', mancanti === 1 && (await testo('#importa-mancanti .mancante button')) === 'cerca…', String(mancanti));
    // ogni sezione si apre a mostrare il codice che verrà creato
    await js(`document.getElementById('importa-p3').hidden = false; document.querySelector('#importa-sezioni .apri-codice').click()`);
    controlla('una sezione si apre a mostrare il codice che verrà creato', (await conta('#importa-sezioni .sezione-codice')) === 1 && (await testo('#importa-sezioni .sezione-codice')).includes('note('));
    await js(`document.querySelector('#importa-sezioni .apri-codice').click()`);
    controlla('e si richiude', (await conta('#importa-sezioni .sezione-codice')) === 0);
    await js(`cutxProva.importa.vai(3)`);
    // importa: il brano nella libreria, i suoni nello stash, aperto nel CUE in modalità brano
    const fileBrano = path.join(stash.radice(), 'libreria', 'tre_notti.cutx');
    const cartellaSuono = path.join(stash.radice(), 'suoni', 'tre_loop');
    await rm(fileBrano, { force: true });
    await js(`document.getElementById('importa-vai').click()`);
    for (let i = 0; i < 40 && !existsSync(fileBrano); i++) await aspetta(0.25);
    await aspetta(1);
    const scritto = existsSync(fileBrano) ? await readFile(fileBrano, 'utf8') : '';
    controlla('importa scrive il brano nella libreria dello stash', scritto.startsWith('// @brano tre notti') && scritto.includes('// @origine ') && scritto.includes('// @suoni tre_loop'), scritto.slice(0, 200));
    controlla('e copia il suono che c\'è nello stash, in una cartella sua', existsSync(path.join(cartellaSuono, 'loop.wav')));
    controlla('il file che manca non si copia (e non rompe niente)', !existsSync(path.join(stash.radice(), 'suoni', 'tre_manca')));
    controlla('il pannello si chiude e il brano è aperto nel CUE', (await js(`document.getElementById('importa').hidden`)) && (await js('cutxProva.cue.modo')) === 'brano' && (await js('cutxProva.cue.brano?.file')) === 'tre_notti.cutx');
    controlla('le sezioni ci sono tutte', (await js('cutxProva.cue.brano.modello.sezioni.length')) === 4);
    controlla('il browser mostra il suono nuovo e il brano nella libreria', (await js('Object.keys(cutxProva.suoniStash()).includes("tre_loop")')) && (await js('cutxProva.libreria().some((b) => b.file === "tre_notti.cutx")')));
    const avviso = await js(`document.getElementById('cue-avviso').textContent`);
    controlla('l\'avviso dice chiaro cosa è stato creato', avviso.includes('creato il brano «tre notti»: 4 sezioni, 1 suono copiato, aperto nel CUE') && avviso.includes('mancant'), avviso);

    // riimportare: il brano che c'è non si tocca senza chiedere
    await js(`cutxProva.importa.apri(${JSON.stringify({ nome: 'tre', percorso: path.join(radice, 'Uno Project', 'tre.als'), cartella: path.join(radice, 'Uno Project') })})`);
    for (let i = 0; i < 40 && !(await js(`document.querySelectorAll('#importa-tracce .traccia').length`)); i++) await aspetta(0.25);
    await js(`(() => { const i = document.getElementById('importa-titolo'); i.value = 'tre notti'; i.dispatchEvent(new Event('change')); })()`);
    await js(`cutxProva.importa.vai(3)`);
    await writeFile(fileBrano, scritto + '// modificato a mano\n');
    await js(`document.getElementById('importa-vai').click()`);
    await aspetta(1);
    controlla('se il brano esiste già chiede prima di sovrascrivere', (await js(`document.querySelector('.dialogo')?.textContent ?? ''`)).includes('esiste già'));
    await premi('Escape');
    await aspetta(0.5);
    controlla('e dicendo di no non lo tocca', (await readFile(fileBrano, 'utf8')).endsWith('// modificato a mano\n') && (await js(`!document.getElementById('importa').hidden`)));
    await js(`cutxProva.importa.chiudi(); cutxProva.cue.brano = null; cutxProva.cue.cambiaModo('libero')`);
    await rm(fileBrano, { force: true });
    await rm(cartellaSuono, { recursive: true, force: true });
    await js('cutxProva.ricaricaStash()');

    await js(`window.cutx.salvaPreferenze({ cartelleAbleton: [] })`);
    await js(`cutxProva.browser.vai('ableton')`);
    await aspetta(0.8);
    const vuota = await js(`document.getElementById('elenco').textContent`);
    controlla('senza cartelle la scheda spiega cosa fa e ha il pulsante "scegli cartella" lì dentro', vuota.includes('Porta in CUTX i tuoi progetti Ableton') && (await js(`!!document.querySelector('#elenco button.key.acid') && document.querySelector('#elenco button.key.acid').textContent`)) === 'scegli cartella', vuota);
    await js(`window.cutx.salvaPreferenze({ cartelleAbleton: [${JSON.stringify(radice)}] })`);
    await js(`cutxProva.browser.vai('suoni')`);
    await js(`document.getElementById('impostazioni').hidden = false; document.querySelector('#imp-nav [data-sez="ableton"]').click()`);
    await aspetta(0.6);
    await js(`document.querySelector('#imp-ableton .imp-riga button').click()`);
    await aspetta(0.6);
    controlla('"togli" toglie la cartella dalle preferenze', ((await js('window.cutx.preferenze()')).cartelleAbleton ?? []).length === 0);
  } finally {
    await js(`window.cutx.salvaPreferenze({ cartelleAbleton: ${JSON.stringify(prima)} }); document.getElementById('impostazioni').hidden = true; document.getElementById('importa').hidden = true`);
    await rm(radice, { recursive: true, force: true });
  }
  ok = (await provaAblotonVeri({ finestre, scrivi, js, controlla })) && ok;
  return ok;
}

// I progetti veri di Valerio (x1 e Mayia): letti soltanto. Si importa nello stash di prova e si ripulisce:
// le cartelle suoni/prova_* e i brani prova_*.cutx che crea questa prova sono le uniche cose che scrive.
async function provaAblotonVeri({ finestre, scrivi, js, controlla }) {
  const cartellaProgetti = path.join(os.homedir(), 'Desktop', 'x1 Project');
  if (!existsSync(cartellaProgetti)) {
    scrivi('(progetti veri di Valerio non trovati: salto)');
    return true;
  }
  const { parse } = await import('../renderer/brano.js').then((m) => ({ parse: m.leggi }));
  const prima = (await js('window.cutx.preferenze()')).cartelleAbleton ?? [];
  const radiceStash = stash.radice();
  const creati = [];
  try {
    await js(`window.cutx.salvaPreferenze({ cartelleAbleton: [${JSON.stringify(cartellaProgetti)}] })`);
    for (const [nome, sigla] of [['x1', 'x1'], ['Mayia u influeced me a bit maybe?', 'mayia']]) {
      const percorso = path.join(cartellaProgetti, `${nome}.als`);
      const titolo = `prova${sigla}`; // una sola parola: i nomi dei suoni cominciano così e non si confondono con quelli di Valerio
      const fileBrano = path.join(radiceStash, 'libreria', `prova${sigla}.cutx`);
      if (existsSync(fileBrano)) throw new Error(`${fileBrano} esiste già: non lo tocco`);
      const modello = await leggiAlsFile(percorso);
      // quello che il pannello sa dei file: quanto pesano e se si possono ritagliare
      const visti = new Map();
      for (const t of modello.tracce) for (const c of t.clip) if (c.tipo === 'audio') visti.set(c.file.relativo || c.file.assoluto, c.file);
      const trovati = await risolviFile(cartellaProgetti, [...visti.values()]);
      const infoFile = Object.fromEntries(trovati.filter((f) => f.percorso).map((f) => [f.chiave, { dimensione: f.dimensione, taglia: f.wav }]));
      const atteso = converti(modello, undefined, { titolo, data: '2026-01-01', file: infoFile });

      await js(`cutxProva.importa.apri(${JSON.stringify({ nome, percorso, cartella: cartellaProgetti })})`);
      for (let i = 0; i < 60 && !(await js(`document.querySelectorAll('#importa-tracce .traccia').length`)); i++) await aspetta(0.25);
      controlla(`${sigla}: il pannello legge il progetto vero (${modello.tracce.length} tracce)`, (await js(`document.querySelectorAll('#importa-tracce .traccia').length`)) === modello.tracce.filter((t) => t.clip.length).length);
      const nSez = await js(`document.querySelectorAll('#importa-sezioni .sezione-riga').length`);
      controlla(`${sigla}: le sezioni del pannello sono quelle del convertitore (${atteso.sezioni.length})`, nSez === atteso.sezioni.length, String(nSez));

      // i file: quanti si trovano e quanti no
      const stato = await js(`[...cutxProva.importa.files.values()].map((f) => !!f.percorso)`);
      scrivi(`      ${sigla}: file audio trovati ${stato.filter(Boolean).length} su ${stato.length}`);
      // un file trovato si serve davvero come anteprima
      const id = await js(`[...cutxProva.importa.files.values()].find((f) => f.id)?.id ?? null`);
      if (id) {
        const r = await js(`fetch('cutx://app/anteprima/${id}').then(async (r) => [r.status, (await r.arrayBuffer()).byteLength])`);
        controlla(`${sigla}: l'anteprima di un file vero si serve (${r[1]} byte)`, r[0] === 200 && r[1] > 1000, JSON.stringify(r));
      }

      // i file pesanti sono nel pannello col loro peso; quelli ritagliabili si ritagliano
      const grandi = await js(`document.getElementById('importa-grandi').hidden ? '' : document.getElementById('importa-grandi').textContent`);
      scrivi(`      ${sigla}: ${atteso.suoni.filter((x) => x.ritaglio).length} suoni da ritagliare su ${atteso.suoni.length}; file pesanti nel pannello: ${grandi ? grandi.replace(/\s+/g, ' ').slice(0, 160) : 'nessuno'}`);
      if (atteso.suoni.some((x) => x.peso > 50e6)) controlla(`${sigla}: i file sopra 50 MB compaiono nel pannello col peso`, grandi.includes('MB') && grandi.includes('pesant'), grandi);
      // ▶ su una variante audio e su una di codice
      const tasti = await js(`[...document.querySelectorAll('#importa-tracce .variante-riga button.key')].map((b, i) => [i, b.disabled])`);
      const primoAudio = await js(`(() => { const t = [...document.querySelectorAll('#importa-tracce .traccia')].find((t) => t.textContent.includes('I FILE AUDIO') || t.textContent.toLowerCase().includes('i file audio')); const b = t?.querySelector('.variante-riga button.key:not(:disabled)'); if (!b) return false; b.click(); return true; })()`);
      if (primoAudio) {
        let c = null;
        for (let i = 0; i < 40 && !c?.codice; i++) {
          await aspetta(0.25);
          c = await chiedi(finestre.cuffia, 'globalThis.cutxStato?.()');
        }
        controlla(`${sigla}: ▶ su un audio vero va in cuffia senza errori`, c.codice?.includes('s("ant_') && !c.errore, JSON.stringify([c.codice?.slice(0, 60), c.errore]));
        await js(`document.querySelector('#importa-tracce .variante-riga button.key.on')?.click()`);
      }
      void tasti;

      // importa davvero
      await js(`(() => { const i = document.getElementById('importa-titolo'); i.value = ${JSON.stringify(titolo)}; i.dispatchEvent(new Event('change')); })()`);
      const suoniAttesi = atteso.suoni.map((x) => x.nome);
      for (const n of suoniAttesi) if (existsSync(path.join(radiceStash, 'suoni', n))) throw new Error(`suoni/${n} esiste già: non lo tocco`);
      creati.push(fileBrano, ...suoniAttesi.map((n) => path.join(radiceStash, 'suoni', n)));
      await js('cutxProva.importa.vai(3)');
      await js(`document.getElementById('importa-vai').click()`);
      // l'importazione è finita quando il pannello si chiude: dopo aver scritto il brano, copiato i suoni (anche 175 MB) e aperto il CUE
      for (let i = 0; i < 240 && (await js(`document.getElementById('importa').hidden`)) !== true; i++) await aspetta(0.25);
      await aspetta(0.5);
      const testo = existsSync(fileBrano) ? await readFile(fileBrano, 'utf8') : '';
      const brano = parse(testo);
      controlla(`${sigla}: il brano importato ha le sue ${atteso.sezioni.length} sezioni, @origine e @suoni`, brano.sezioni.length === atteso.sezioni.length && testo.includes(`// @origine ${percorso}`) && testo.includes('// @suoni '), testo.slice(0, 200));
      const copiati = suoniAttesi.filter((n) => existsSync(path.join(radiceStash, 'suoni', n)));
      const trovabili = await js(`[...cutxProva.importa.files.entries()].filter(([, f]) => f.percorso).length`);
      scrivi(`      ${sigla}: suoni copiati nello stash ${copiati.length} su ${suoniAttesi.length}`);
      for (const x of atteso.suoni.filter((y) => y.ritaglio)) {
        const cartellaSuono = path.join(radiceStash, 'suoni', x.nome);
        const wavScritto = existsSync(cartellaSuono) ? (await readdir(cartellaSuono)).find((f) => f.endsWith('.wav')) : null;
        const durata = wavScritto ? await durataWav(path.join(cartellaSuono, wavScritto)) : null;
        controlla(`${sigla}: ${x.nome} è stato ritagliato (${Math.round(x.ritaglio.a - x.ritaglio.da)} s di ${Math.round(x.durata)} s)`, durata !== null && Math.abs(durata - (x.ritaglio.a - x.ritaglio.da)) < 0.01 && (await stat(path.join(cartellaSuono, wavScritto))).size < x.dimensione, String(durata));
      }
      controlla(`${sigla}: ogni file trovato è stato copiato`, copiati.length === suoniAttesi.filter((n) => atteso.suoni.find((x) => x.nome === n) && true).length - (suoniAttesi.length - copiati.length) && trovabili >= copiati.length);
      // ogni sezione, dal file scritto, si valuta con Strudel
      const codici = brano.sezioni.map((sez) => `${brano.preambolo.join('\n')}\n${sez.corpo.join('\n')}`);
      const sbagliate = await js(`(async () => { const e = []; for (const c of ${JSON.stringify(codici)}) { const r = await cutxProva.valutaCodice(c); if (r.errore) e.push(r.errore); } return e; })()`);
      controlla(`${sigla}: ogni sezione del brano scritto si valuta con Strudel`, sbagliate.length === 0, sbagliate.slice(0, 2).join(' | '));
      controlla(`${sigla}: il brano è aperto nel CUE in modalità brano`, (await js('cutxProva.cue.modo')) === 'brano' && (await js('cutxProva.cue.brano?.file')) === `prova${sigla}.cutx`);
      await js(`cutxProva.cue.brano = null; cutxProva.cue.cambiaModo('libero'); document.getElementById('importa').hidden = true`);
    }
  } finally {
    // via le cose create da questa prova, e solo quelle
    for (const c of creati) await rm(c, { recursive: true, force: true });
    await js(`window.cutx.salvaPreferenze({ cartelleAbleton: ${JSON.stringify(prima)} })`);
    await js('cutxProva.ricaricaStash()');
  }
  return true;
}

// --- schermate: ogni pannello a più dimensioni, con la ricerca di testo tagliato e di cose che escono ---

// Gira nella pagina: elenca quello che esce dal viewport, dal suo contenitore o viene tagliato senza puntini.
const CERCA_PROBLEMI = `(() => {
  const problemi = [];
  const vw = innerWidth;
  const visibile = (el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'none' || s.visibility === 'hidden' || p.hidden) return false;
    }
    return true;
  };
  const nome = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase()) + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
  const testo = (el) => (el.textContent || el.value || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
  for (const el of document.querySelectorAll('body *')) {
    if (!visibile(el) || el.closest('.suggerimento, svg')) continue;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    // 1. fuori dalla finestra
    if (r.right > vw + 1 || r.left < -1) problemi.push({ tipo: 'fuori dalla finestra', el: nome(el), testo: testo(el) });
    // 2. tagliato senza puntini (un elemento che nasconde l'eccesso)
    if (el.tagName !== 'INPUT' && (s.overflowX === 'hidden' || s.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1 && s.textOverflow !== 'ellipsis' && el.children.length === 0 && testo(el))
      problemi.push({ tipo: 'testo tagliato', el: nome(el), testo: testo(el) });
    // 3. pulsanti e etichette che non ci stanno nella propria scatola
    if (el.matches('.key, .lbl, button, select, label') && el.scrollWidth > el.clientWidth + 1 && s.textOverflow !== 'ellipsis' && s.overflowX !== 'auto' && s.overflowX !== 'scroll' && !el.matches('select'))
      problemi.push({ tipo: 'più largo della sua scatola', el: nome(el), testo: testo(el) });
    // 4. esce dal contenitore che taglia (overflow nascosto) in orizzontale
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.overflowX === 'hidden' || ps.overflowX === 'clip' || ps.overflowX === 'auto' || ps.overflowX === 'scroll') {
        const pr = p.getBoundingClientRect();
        if (r.right > pr.right + 1 && ps.overflowX !== 'auto' && ps.overflowX !== 'scroll') problemi.push({ tipo: 'tagliato dal contenitore', el: nome(el), testo: testo(el) });
        break;
      }
    }
  }
  // 5. pulsanti che si sovrappongono nella stessa riga
  for (const riga of document.querySelectorAll('.schede, .piede, .testa, .card-testa, .barra, .traccia-testa, .imp-testa, .importa-piede, .esempio-tasti, .fila')) {
    if (!visibile(riga)) continue;
    const figli = [...riga.children].filter(visibile).map((c) => c.getBoundingClientRect());
    for (let i = 0; i < figli.length; i++) for (let j = i + 1; j < figli.length; j++) {
      const a = figli[i], b = figli[j];
      if (a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2) problemi.push({ tipo: 'si sovrappongono', el: nome(riga), testo: testo(riga) });
    }
  }
  const visti = new Set();
  return problemi.filter((p) => !visti.has(p.tipo + p.el + p.testo) && visti.add(p.tipo + p.el + p.testo)).slice(0, 30);
})()`;

export async function schermate({ finestre, cartella }) {
  const pronta = () => chiedi(finestre.controllo, '!!globalThis.cutxProva && !!document.querySelector(".cm-editor")');
  await aspettaChe(async () => (await chiedi(finestre.live, 'globalThis.cutxStato?.()')) && (await pronta()));
  await aspetta(1);
  const js = (codice) => chiedi(finestre.controllo, codice);
  const wc = finestre.controllo.webContents;
  const progettiVeri = path.join(os.homedir(), 'Desktop', 'x1 Project');
  const haVeri = existsSync(progettiVeri);
  const prima = (await js('window.cutx.preferenze()')).cartelleAbleton ?? [];
  if (haVeri) await js(`window.cutx.salvaPreferenze({ cartelleAbleton: [${JSON.stringify(progettiVeri)}] })`);
  // uno stato da fotografare: un po' di live, un editor con del codice
  await js(`cutxProva.valuta('live', ${JSON.stringify(FOTO_LIVE)})`);
  await js(`cutxProva.scriviCue(${JSON.stringify(FOTO_CUE)})`);
  await js(`cutxProva.valuta('cuffia', ${JSON.stringify(FOTO_CUE)})`);
  await js(`cutxProva.scriviCue('// @sezione quiet streets ambience sound library\\nnote("c2 [eb2 g2] c3 <bb1 f2>").s("sawtooth").lpf(800).gain(.0001)'); cutxProva.scegliEntraTra(1)`);
  await wc.executeJavaScript('cutxProva.goLive()');
  await js(`cutxProva.scriviCue(${JSON.stringify(FOTO_CUE)})`);
  await aspetta(3);

  const riepilogo = [];
  for (const [w, h] of [[1280, 800], [1440, 900]]) {
    finestre.controllo.setContentSize(w, h);
    await aspetta(1);
    const dir = path.join(cartella, `${w}x${h}`);
    await mkdir(dir, { recursive: true });
    const scatta = async (nome) => {
      await aspetta(0.5);
      await writeFile(path.join(dir, `${nome}.png`), (await wc.capturePage()).toPNG());
      const problemi = await js(CERCA_PROBLEMI);
      riepilogo.push({ w, h, nome, problemi });
      console.log(`[schermate] ${w}x${h} ${nome}: ${problemi.length ? problemi.length + ' problemi' : 'ok'}`);
      for (const p of problemi) console.log(`     - ${p.tipo}: ${p.el} "${p.testo}"`);
    };
    const scheda = (n) => js(`cutxProva.browser.vai(${JSON.stringify(n)})`);
    await scheda('suoni');
    await scatta('postazione');
    await scheda('libreria');
    await scatta('browser-libreria');
    if (haVeri) {
      await scheda('ableton');
      await aspetta(3);
      await scatta('browser-ableton');
    }
    await js(`cutxProva.browser.helpAperti.add('lpf()'); cutxProva.browser.vai('help')`);
    await scatta('browser-help');
    await scheda('suoni');
    // il CUE in modalità brano
    const cartellaLibreria = path.join(stash.radice(), 'libreria');
    await writeFile(path.join(cartellaLibreria, 'schermate_notte.cutx'), NOTTE);
    await js(`cutxProva.cue.apri('schermate_notte.cutx')`);
    await aspetta(1);
    await js(`(() => { const c = cutxProva.cue.carte.find((c) => c.i === 1); cutxProva.cue.attiva(c); })()`);
    await scatta('cue-brano');
    // il brano è a 140 e il set a 100: "brano a 140 · set a 100", il pulsante, l'avviso sulle sezioni audio; e un cambio in arrivo
    await js(`cutxProva.valuta('live', 'setcpm(60/4)\\ns("sine*2").gain(.0001)')`);
    await aspetta(1.5);
    await js(`(() => { const c = cutxProva.cue.carte.find((c) => c.i === 2); if (c) c.editor.codice = 's("sine").begin(.1).end(.5).gain(.0001)'; })()`);
    await js(`document.getElementById('bpm').focus()`);
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Up', modifiers: [] });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Up', modifiers: [] });
    await aspetta(0.6);
    await scatta('cue-brano-tempo');
    await js(`cutxProva.valuta('live', ${JSON.stringify(FOTO_LIVE)})`);
    await aspetta(1);
    await js(`cutxProva.cue.brano = null; cutxProva.cue.cambiaModo('libero')`);
    await rm(path.join(cartellaLibreria, 'schermate_notte.cutx'), { force: true });
    // le impostazioni, una sezione alla volta
    wc.sendInputEvent({ type: 'keyDown', keyCode: ',', modifiers: ['meta'] });
    await aspetta(1);
    for (const sez of ['generale', 'audio', 'scorciatoie', 'proiezione', 'stash', 'ableton', 'estensioni']) {
      await js(`document.querySelector('#imp-nav [data-sez="${sez}"]').click()`);
      await scatta(`impostazioni-${sez}`);
    }
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    await aspetta(0.5);
    // il pannello di importazione
    if (haVeri) {
      for (const [nome, sigla] of [['x1', 'x1'], ['Mayia u influeced me a bit maybe?', 'mayia']]) {
        await js(`cutxProva.importa.apri(${JSON.stringify({ nome, percorso: path.join(progettiVeri, `${nome}.als`), cartella: progettiVeri })})`);
        await aspetta(2.5);
        await scatta(`importa-${sigla}-1-progetto`);
        await js('cutxProva.importa.vai(2)');
        await scatta(`importa-${sigla}-2-tracce`);
        if (sigla === 'x1') {
          // una traccia MIDI in modalità audio: la riga dello stem
          await js(`document.querySelector('#importa-tracce .modo[data-modo="audio"]')?.click()`);
          await scatta('importa-x1-2-stem');
        }
        await js('cutxProva.importa.vai(3)');
        await js(`document.querySelector('#importa-sezioni .apri-codice')?.click()`);
        await scatta(`importa-${sigla}-3-importa`);
        await js('cutxProva.importa.chiudi()');
      }
    }
  }
  // il proiettore con tanto codice: 2 livelli e 5 livelli lunghi, a 1280×720 e 1920×1080
  {
    const dir = path.join(cartella, 'proiettore');
    await mkdir(dir, { recursive: true });
    for (const [l, a] of [[1280, 720], [1920, 1080]]) {
      for (const quanti of [2, 5]) {
        const problemi = [];
        const v = await provaCodiceUscita({
          finestre,
          scrivi: () => {},
          controlla: (nome, vero) => !vero && problemi.push({ tipo: 'uscita', el: nome, testo: '' }),
          js,
          quanti,
          righe: 11,
          larghezza: l,
          altezza: a,
          etichetta: `${l}×${a} ${quanti} livelli`,
        });
        const nome = `uscita-${quanti}-livelli-${l}x${a}`;
        await writeFile(path.join(dir, `${nome}.png`), (await finestre.uscita.webContents.capturePage()).toPNG());
        riepilogo.push({ w: l, h: a, nome, problemi });
        console.log(`[schermate] ${nome}: ${problemi.length ? problemi.length + ' problemi' : 'ok'} · carattere ${Math.round(v.carattere)} px, ${v.disposizione}, ${v.scorre ? 'scorre' : 'ci sta'}`);
        for (const p of problemi) console.log(`     - ${p.el}`);
      }
    }
    await js('cutxProva.fermaTutto()');
    await js('window.cutx.uscitaAperta().then((a) => a && window.cutx.uscitaOnOff())');
  }
  await js(`window.cutx.salvaPreferenze({ cartelleAbleton: ${JSON.stringify(prima)} })`);
  const totale = riepilogo.reduce((n, r) => n + r.problemi.length, 0);
  console.log(`[schermate] ${riepilogo.length} schermate, ${totale} problemi`);
  await writeFile(path.join(cartella, 'problemi.json'), JSON.stringify(riepilogo, null, 2));
  return totale;
}

// --- prova del neon: acceso, ronzio, flicker, una lettera che si spegne; uguale nella postazione e sull'uscita ---

async function provaNeon({ finestre, scrivi }) {
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}${!vero && dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  const js = (codice) => chiedi(finestre.controllo, codice);
  // quello che si può misurare in una finestra: com'è la scritta, e cosa succede quando si forza un flicker o una lettera
  const misura = (finestra, forzaFlicker, forzaLettera) => chiedi(finestra, `(async () => {
    const el = document.getElementById('insegna');
    const s = getComputedStyle(el);
    const registro = { sfarfalla: 0, lettere: 0 };
    const o = new MutationObserver((m) => {
      for (const x of m) {
        if (x.target === el && el.classList.contains('sfarfalla')) registro.sfarfalla++;
        if (x.target.classList?.contains('l') && x.target.classList.contains('spenta')) registro.lettere++;
      }
    });
    o.observe(el, { attributes: true, subtree: true, attributeFilter: ['class'] });
    await (${forzaFlicker})();
    await (${forzaLettera})();
    o.disconnect();
    return {
      colore: s.color, ombra: s.textShadow, animazione: s.animationName, lettere: el.querySelectorAll('.l').length,
      testo: el.textContent, registro,
    };
  })()`);
  const luminosita = (colore) => {
    const [r, g, b] = colore.match(/[\d.]+/g).map(Number);
    return (r + g + b) / 3;
  };
  const verifiche = async (nome, finestra, flicker, lettera) => {
    const m = await misura(finestra, flicker, lettera);
    controlla(`${nome}: il neon è acceso (non spento), col glow verde`, luminosita(m.colore) > 90 && m.ombra !== 'none' && m.ombra.includes('159, 194, 58'), `${m.colore} · ${m.ombra}`);
    controlla(`${nome}: c'è il ronzio continuo (animazione lenta)`, m.animazione.includes('ronzio'), m.animazione);
    controlla(`${nome}: ogni lettera è a sé, e il testo è intero`, m.lettere === 18 && m.testo === 'TECNOLOGIA CANAGLIA', `${m.lettere} · ${m.testo}`);
    controlla(`${nome}: un flicker ha da 2 a 4 sfarfallii rapidi`, m.registro.sfarfalla >= 2 && m.registro.sfarfalla <= 4, JSON.stringify(m.registro));
    controlla(`${nome}: una sola lettera si spegne per un attimo`, m.registro.lettere === 1, JSON.stringify(m.registro));
    const dopo = await chiedi(finestra, `(() => { const el = document.getElementById('insegna'); return !el.classList.contains('sfarfalla') && !el.querySelector('.l.spenta'); })()`);
    controlla(`${nome}: poi torna acceso, intero`, dopo === true);
  };
  await js('cutxProva.fermaInsegna()'); // i flicker e le lettere a caso si fermano: si misura solo quello che si forza
  await verifiche('postazione', finestre.controllo, 'cutxProva.accendiInsegna', 'cutxProva.spegniLettera');
  // sul proiettore (la finestra di uscita): stesso comportamento
  await js('window.cutx.uscitaOnOff()');
  for (let i = 0; i < 40 && !finestre.uscita; i++) await aspetta(0.25);
  await aspetta(1.5);
  if (finestre.uscita) {
    await chiedi(finestre.uscita, 'cutxInsegna.ferma()');
    await verifiche('uscita', finestre.uscita, 'cutxInsegna.sfarfalla', 'cutxInsegna.spegniLettera');
    await js('window.cutx.uscitaOnOff()');
  } else controlla('la finestra di uscita si apre', false);
  // i tempi: tra un flicker e l'altro 8–20 s, una lettera ogni 5–14 s (sono costanti del modulo)
  const sorgente = await readFile(new URL('../renderer/insegna.js', import.meta.url), 'utf8');
  controlla('i tempi sono quelli chiesti: flicker ogni 8–20 s', /FLICKER_MIN_MS = 8_000/.test(sorgente) && /FLICKER_MAX_MS = 20_000/.test(sorgente));
  return ok;
}

// --- prova del tempo del set: il numero in alto, il preambolo dei brani, la frase, il salvataggio ---

async function provaTempo({ finestre, scrivi }) {
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}${!vero && dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  const js = (codice) => chiedi(finestre.controllo, codice);
  const live = () => chiedi(finestre.live, 'globalThis.cutxStato?.()');
  const wc = () => finestre.controllo.webContents;
  const premi = async (tasto, ...modificatori) => {
    wc().sendInputEvent({ type: 'keyDown', keyCode: tasto, modifiers: modificatori });
    wc().sendInputEvent({ type: 'keyUp', keyCode: tasto, modifiers: modificatori });
    await aspetta(0.4);
  };
  let s = null;
  const testoBpm = () => js(`document.getElementById('bpm').textContent`);
  const cpsDi = (bpm) => bpm / 240;
  // aspetta che il tempo del set (cps) arrivi a quel valore, al massimo s secondi
  const finche = async (fn, s = 8) => {
    for (let i = 0; i < s * 5; i++) {
      const r = await fn();
      if (r) return r;
      await aspetta(0.2);
    }
    return null;
  };
  const impostaSet = async (bpm) => {
    await js(`cutxProva.fermaTutto(); cutxProva.valuta('live', 'setcpm(${bpm}/4)\\ns("sine*2").gain(.0001)')`);
    await aspetta(0.8);
  };
  const file = path.join(stash.radice(), 'libreria', 'prova_tempo.cutx');
  const filesLibro = path.join(stash.radice(), 'libreria', 'prova_tempo_salvato.cutx');
  await writeFile(file, '// @brano prova tempo\n// @bpm 86\nsetcpm(86/4)\n// @sezione drum\ns("sine*2").gain(.0001)\n// @sezione loop\ns("sine").begin(.1).end(.5).gain(.0001)\n');
  try {
    await js('cutxProva.cue.brano = null; cutxProva.cue.cambiaModo("libero"); cutxProva.fermaTutto()');
    // a 60 BPM un ciclo dura 4 secondi: il cambio resta "in arrivo" abbastanza da vederlo
    await impostaSet(60);
    controlla('il numero in alto è il tempo del set', (await testoBpm()) === '60', await testoBpm());

    // --- il numero si cambia da lì: frecce, ⇧, scrittura, trascinamento; entra all'inizio del ciclo dopo ---
    await js(`document.getElementById('bpm').focus()`);
    // (senza l'attesa di premi(): il cambio resta "in arrivo" da pochi decimi di secondo a un ciclo intero, e con 0,4 s di attesa
    // a volte il ciclo era già cambiato prima di guardare)
    wc().sendInputEvent({ type: 'keyDown', keyCode: 'Up', modifiers: [] });
    wc().sendInputEvent({ type: 'keyUp', keyCode: 'Up', modifiers: [] });
    let visto = null;
    for (let i = 0; i < 80 && !visto; i++) {
      const stato = await live();
      if (stato.tempoInArrivo?.length) visto = { stato, testo: await testoBpm() };
      else await aspetta(0.02);
    }
    controlla('↑ chiede +1 BPM e il cambio è in arrivo (non subito)', !!visto && Math.abs(visto.stato.cps - cpsDi(60)) < 1e-9 && Math.abs(visto.stato.tempoInArrivo[0].cps - cpsDi(61)) < 1e-9, JSON.stringify(visto?.stato.tempoInArrivo));
    controlla('il numero mostra "60 → 61" finché non entra', visto?.testo === '60 → 61', visto?.testo);
    controlla('entra all\'inizio del ciclo dopo', !!(await finche(async () => Math.abs((await live()).cps - cpsDi(61)) < 1e-9)) && !!(await finche(async () => (await testoBpm()) === '61', 2)), await testoBpm());
    await premi('Up', 'shift');
    controlla('⇧↑ sono ±0,1', !!(await finche(async () => Math.abs((await live()).cps - cpsDi(61.1)) < 1e-9, 10)), String((await live()).cps * 240));
    await premi('Down');
    controlla('↓ toglie 1', !!(await finche(async () => Math.abs((await live()).cps - cpsDi(60.1)) < 1e-9, 10)), String((await live()).cps * 240));
    // scrivo il numero: clic, scrivo, invio
    await js(`(() => { const e = document.getElementById('bpm'); e.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientY: 10, pointerId: 1, bubbles: true })); e.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientY: 10, pointerId: 1, bubbles: true })); })()`);
    controlla('un clic sul numero apre la scrittura', (await js(`!!document.querySelector('#bpm input.bpm-input')`)) === true);
    await js(`(() => { const i = document.querySelector('#bpm input.bpm-input'); i.value = '90,5'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
    controlla('scrivo 90,5 e invio: il set va lì al ciclo dopo', !!(await finche(async () => Math.abs((await live()).cps - cpsDi(90.5)) < 1e-9, 10)), String((await live()).cps * 240));
    // esc lascia com'era
    await js(`(() => { const e = document.getElementById('bpm'); e.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientY: 10, pointerId: 1, bubbles: true })); e.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientY: 10, pointerId: 1, bubbles: true })); })()`);
    await js(`(() => { const i = document.querySelector('#bpm input.bpm-input'); i.value = '200'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()`);
    await aspetta(0.5);
    controlla('esc annulla la scrittura', Math.abs((await live()).cps - cpsDi(90.5)) < 1e-9 && !(await js(`!!document.querySelector('#bpm input.bpm-input')`)));
    // trascino: 20 pixel in su sono 4 passi
    await js(`(() => { const e = document.getElementById('bpm'); const p = (tipo, y) => e.dispatchEvent(new PointerEvent(tipo, { button: 0, clientY: y, pointerId: 1, bubbles: true })); p('pointerdown', 100); p('pointermove', 90); p('pointermove', 80); p('pointerup', 80); })()`);
    controlla('trascinando su di 20 pixel il tempo sale di 4', !!(await finche(async () => Math.abs((await live()).cps - cpsDi(94.5)) < 1e-9, 10)), String((await live()).cps * 240));

    // --- la frase continua a contare normale attraverso i cambi di tempo ---
    await impostaSet(120);
    const viste = [];
    const t0 = Date.now();
    await js(`document.getElementById('bpm').focus()`);
    let giri = 0;
    while (Date.now() - t0 < 12000) {
      if (giri === 8) await premi('Up'); // cambi di tempo mentre guardo la frase
      if (giri === 30) await premi('Down', 'shift');
      giri++;
      const f = Number(await js(`document.getElementById('frase-numero').textContent`));
      if (Number.isFinite(f) && viste.at(-1) !== f) viste.push(f);
      await aspetta(0.15);
    }
    const salti = viste.filter((f, i) => i > 0 && f !== (viste[i - 1] % 16) + 1);
    controlla('la frase conta di uno alla volta anche cambiando il tempo', viste.length >= 3 && salti.length === 0, JSON.stringify(viste));

    // --- la cuffia segue il cambio di tempo entrando al ciclo giusto (restano allineate: stesso ciclo nello stesso momento) ---
    await impostaSet(120);
    await aspetta(1);
    let scarto = 0;
    let campioni = 0;
    await js(`document.getElementById('bpm').focus()`);
    for (let i = 0; i < 70; i++) {
      if (i === 5) await premi('Up', 'shift');
      if (i === 5) for (let k = 0; k < 4; k++) await premi('Up'); // un salto di qualche BPM
      const [a, b] = [await live(), await chiedi(finestre.cuffia, 'globalThis.cutxStato?.()')];
      if (a.ciclo !== null && b.ciclo !== null) {
        scarto = Math.max(scarto, Math.abs(a.ciclo - b.ciclo));
        campioni++;
      }
      await aspetta(0.1);
    }
    const [sl, sc] = [await live(), await chiedi(finestre.cuffia, 'globalThis.cutxStato?.()')];
    controlla('cuffia e live restano allo stesso ciclo attraverso il cambio di tempo (scarto < 0,1 cicli)', campioni > 30 && scarto < 0.1, `scarto ${scarto.toFixed(3)} su ${campioni}`);
    controlla('e la cuffia è al nuovo tempo', Math.abs(sc.cps - sl.cps) < 1e-9 && sl.cps * 240 > 124, `${sl.cps * 240} / ${sc.cps * 240}`);

    // --- un brano a un altro BPM, con il live che suona: il set non cambia da solo ---
    await impostaSet(120);
    await js('cutxProva.ricaricaLibreria()');
    await js(`cutxProva.cue.apri('prova_tempo.cutx')`);
    await aspetta(1);
    const vista = await finche(() => js(`!document.getElementById('cue-tempo').hidden`), 4);
    controlla('nel CUE, accanto al nome del brano, "brano a 86 · set a 120" col pulsante per portare il set', vista && (await js(`document.getElementById('cue-tempo-testo').textContent`)) === 'brano a 86 · set a 120' && (await js(`document.getElementById('cue-porta').textContent`)) === 'porta il set a 86');
    controlla('e sta nell\'intestazione, vicino al brano', (await js(`(() => { const t = document.querySelector('.cue .testa'); return t.contains(document.getElementById('cue-tempo')) && t.contains(document.getElementById('modo-brano')); })()`)) === true);
    const avvisoAudio = await js(`(() => { const c = cutxProva.cue.carte.find((c) => c.i === 1); c.avvisoTempo.hidden; return [c.avvisoTempo.hidden, c.avvisoTempo.textContent]; })()`);
    controlla('la sezione audio (begin/end) avvisa che non segue il tempo', avvisoAudio[0] === false && avvisoAudio[1].includes('tempo originale') && avvisoAudio[1].includes('86'), JSON.stringify(avvisoAudio));
    controlla('quella di codice no', (await js(`cutxProva.cue.carte.find((c) => c.i === 0).avvisoTempo.hidden`)) === true);
    await js(`(() => { const c = cutxProva.cue.carte.find((c) => c.i === 0); cutxProva.cue.attiva(c); })()`);
    await js('cutxProva.scegliEntraTra(1)');
    const r = await wc().executeJavaScript('cutxProva.goLive()');
    await aspetta(2.5);
    s = await live();
    controlla('mando live la sezione: il tempo del set NON cambia', !r.errore && Math.abs(s.cps - cpsDi(120)) < 1e-9, JSON.stringify([r.errore, s.cps]));
    const nuovo = s.livelli.find((l) => l.nome === 'drum');
    controlla('e il suo codice non porta il setcpm del brano', !!nuovo && !nuovo.codice.includes('setcpm(86'), nuovo?.codice);
    controlla('il CUE dice che il set resta', (await js(`document.getElementById('cue-avviso').textContent`)).includes('il set resta a 120'), await js(`document.getElementById('cue-avviso').textContent`));
    await js(`document.getElementById('cue-porta').click()`);
    controlla('"porta il set a 86" porta il set lì, al ciclo dopo', !!(await finche(async () => Math.abs((await live()).cps - cpsDi(86)) < 1e-9)), String((await live()).cps * 240));
    await aspetta(0.5);
    controlla('e l\'avviso sparisce', (await js(`document.getElementById('cue-tempo').hidden`)) === true);
    // il live vuoto prende il tempo del brano, come sempre (il suo preambolo resta nel codice)
    await impostaSet(120);
    await js(`cutxProva.fermaTutto()`);
    await aspetta(1.2);
    await js(`cutxProva.ricaricaLibreria(); cutxProva.cue.apri('prova_tempo.cutx')`);
    await aspetta(1);
    await js(`(() => { const c = cutxProva.cue.carte.find((c) => c.i === 0); cutxProva.cue.attiva(c); })()`);
    const r2 = await wc().executeJavaScript('cutxProva.goLive()');
    controlla('con il live vuoto il brano porta il suo tempo (86)', !r2.errore && !!(await finche(async () => Math.abs((await live()).cps - cpsDi(86)) < 1e-9)), String((await live()).cps * 240));
    controlla('e il suo codice ha ancora il setcpm del brano', ((await live()).livelli.find((l) => l.nome === 'drum')?.codice ?? '').includes('setcpm(86/4)'));
    controlla('senza messaggi sul tempo che non cambia', !(await js(`document.getElementById('cue-avviso').textContent`)).includes('il set resta'));

    // a) il set va a 128; mando live un'altra sezione (stesso brano a 86: il set resta) e salvo il live come brano:
    //    @bpm e setcpm del file sono il tempo del set in quel momento (128), non quello del brano da cui venivano le sezioni (86)
    await js(`(() => { const e = document.getElementById('bpm'); e.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientY: 10, pointerId: 1, bubbles: true })); e.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientY: 10, pointerId: 1, bubbles: true })); })()`);
    await js(`(() => { const i = document.querySelector('#bpm input.bpm-input'); i.value = '128'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
    controlla('il set va a 128', !!(await finche(async () => Math.abs((await live()).cps - cpsDi(128)) < 1e-9)));
    // un livello che entrava più tardi col suo tempo non lo riporta indietro: il numero a mano ha l'ultima parola
    await aspetta(3);
    controlla('e ci resta (il tempo scelto a mano vince su un livello in arrivo col suo setcpm)', Math.abs((await live()).cps - cpsDi(128)) < 1e-9, String((await live()).cps * 240));
    await js(`(() => { const c = cutxProva.cue.carte.find((c) => c.i === 1); cutxProva.cue.attiva(c); })()`);
    const r3 = await wc().executeJavaScript('cutxProva.goLive()');
    await aspetta(2.5);
    s = await live();
    controlla('un\'altra sezione del brano a 86 entra e il set resta a 128', !r3.errore && Math.abs(s.cps - cpsDi(128)) < 1e-9 && s.livelli.filter((l) => l.a === null).length === 2, JSON.stringify([r3.errore, s.cps * 240, s.livelli.length]));
    wc().executeJavaScript('cutxProva.salvaLiveComeBrano()');
    await aspetta(0.4);
    await js(`(() => { const i = document.querySelector('.dialogo input'); i.value = 'prova tempo salvato'; i.dispatchEvent(new Event('input')); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
    await aspetta(1.2);
    const salvato = existsSync(filesLibro) ? await readFile(filesLibro, 'utf8') : '';
    const brano = (await import('../renderer/brano.js')).leggi(salvato);
    controlla('il brano salvato ha @bpm 128, e il tempo del set', salvato.includes('// @bpm 128') && brano.preambolo.includes('setcpm(128/4)'), salvato.slice(0, 160));
    controlla('e non il tempo del brano da cui venivano le sezioni', !salvato.includes('86') && !/setcpm\(86/.test(salvato), salvato);
    controlla('con le due sezioni', brano.sezioni.length === 2, String(brano.sezioni.length));
  } finally {
    await rm(file, { force: true });
    await rm(filesLibro, { force: true });
    await js('cutxProva.fermaTutto(); cutxProva.cue.brano = null; cutxProva.cue.cambiaModo("libero")');
  }
  return ok;
}

// --- prova di solidità: versione e registro, stash non collegato, scheda audio scollegata, motori che crashano ---

async function provaSolidita({ finestre, scrivi }) {
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}${!vero && dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  const js = (codice) => chiedi(finestre.controllo, codice);
  const liveJs = (codice) => chiedi(finestre.live, codice);
  const live = () => chiedi(finestre.live, 'globalThis.cutxStato?.()');
  const wc = () => finestre.controllo.webContents;
  const finche = async (fn, s = 8) => {
    for (let i = 0; i < s * 5; i++) {
      const r = await fn();
      if (r) return r;
      await aspetta(0.2);
    }
    return null;
  };
  const registro = path.join(path.dirname(finestre.controllo.webContents.session.getStoragePath() ?? ''), 'log', 'cutx.log');
  void registro;
  const fileLog = path.join(os.homedir(), 'Library', 'Application Support', 'CUTX-prova', 'log', 'cutx.log');
  const versione = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')).version;

  // --- versione e registro ---
  await js(`document.getElementById('impostazioni').hidden = false; document.querySelector('#imp-nav [data-sez="generale"]').click()`);
  await aspetta(0.6);
  controlla(`la versione (${versione}) si vede nelle impostazioni`, (await js(`document.getElementById('imp-versione').textContent`)) === `versione ${versione}`, await js(`document.getElementById('imp-versione').textContent`));
  controlla('con Electron e Chromium', /Electron \d+/.test(await js(`document.getElementById('imp-versione-dettagli').textContent`)));
  controlla('e il percorso del registro', (await js(`document.getElementById('imp-registro').textContent`)).endsWith('cutx.log'));
  await js(`document.getElementById('impostazioni').hidden = true`);
  await wc().executeJavaScript(`console.error('prova-errore-nel-registro'); console.warn('prova-avviso-nel-registro')`);
  await aspetta(0.8);
  const testoLog = await readFile(fileLog, 'utf8').catch(() => '');
  controlla('il registro ha la riga di avvio con la versione', new RegExp(`\\[info\\] \\[avvio\\] CUTX ${versione.replace(/\./g, '\\.')}`).test(testoLog), testoLog.slice(0, 200));
  controlla('gli errori delle pagine finiscono nel registro, con data, livello e chi parla', /\d{4}-\d\d-\d\dT[\d:.]+Z \[errore\] \[controllo\] prova-errore-nel-registro/.test(testoLog));
  controlla('e gli avvisi', /\[avviso\] \[controllo\] prova-avviso-nel-registro/.test(testoLog));

  // --- stash su un SSD non collegato ---
  const vero = stash._percorsoPerProva('/Volumes/SSD-non-collegato/stash-del-set');
  await js('cutxProva.ricaricaStash()');
  controlla('stash non collegato: un avviso chiaro in cima, non una schermata vuota', (await js(`!document.getElementById('avviso-stash').hidden`)) === true);
  const avvisoStash = await js(`document.getElementById('avviso-stash-testo').textContent`);
  controlla('dice quale stash e cosa fare', avvisoStash.includes('stash-del-set') && avvisoStash.includes('non è collegato') && avvisoStash.includes('Attacca il disco'), avvisoStash);
  controlla('e la barra dice che manca', (await js(`document.getElementById('stash-nome').textContent`)) === 'manca');
  controlla('la postazione c\'è lo stesso (CUE, browser, LIVE)', (await js(`!!document.querySelector('.cm-editor') && !!document.getElementById('elenco') && !!document.getElementById('livelli')`)) === true);
  stash._percorsoPerProva(vero); // il disco torna
  controlla('appena il disco torna CUTX riprende da solo', !!(await finche(async () => (await js(`document.getElementById('avviso-stash').hidden`)) === true, 6)));
  controlla('e lo dice', (await js(`document.getElementById('cue-avviso').textContent`)).includes('ritrovato'), await js(`document.getElementById('cue-avviso').textContent`));
  await aspetta(0.5);
  controlla('con i suoni di nuovo al loro posto', Object.keys(await js('cutxProva.suoniStash()')).length > 1);

  // --- scheda audio scollegata e ricollegata mentre suona ---
  const configPrima = (await js('window.cutx.stash()')).config?.uscite ?? {};
  await liveJs(`(() => {
    const md = navigator.mediaDevices;
    window.__finto = { elenco: [{ deviceId: 'finto1', kind: 'audiooutput', label: 'MiniFuse prova', groupId: 'g' }], sink: [], enumera: md.enumerateDevices, setSink: AudioContext.prototype.setSinkId };
    md.enumerateDevices = async () => window.__finto.elenco;
    AudioContext.prototype.setSinkId = async function (id) { window.__finto.sink.push(id); Object.defineProperty(this, 'sinkId', { value: id, configurable: true }); };
  })()`);
  await js(`window.cutx.salvaConfig({ uscite: { live: 'MiniFuse prova', cuffia: '' } })`);
  controlla('con la scheda collegata il live suona lì', !!(await finche(async () => (await live()).uscita?.ok && (await live()).uscita.dettaglio.includes('MiniFuse prova'))), JSON.stringify((await live()).uscita));
  controlla('(usando davvero quel dispositivo)', (await liveJs('window.__finto.sink')).includes('finto1'));
  await js(`cutxProva.fermaTutto(); cutxProva.valuta('live', 'setcpm(120/4)\\ns("sine*4").gain(.0001)')`);
  await aspetta(1);
  await liveJs(`(() => { window.__finto.elenco = []; navigator.mediaDevices.dispatchEvent(new Event('devicechange')); })()`);
  const spenta = await finche(async () => (await live()).uscita?.ok === false);
  controlla('scheda scollegata mentre suona: il live se ne accorge', !!spenta, JSON.stringify((await live()).uscita));
  controlla('e passa all\'uscita predefinita, così non resta muto', (await liveJs('window.__finto.sink')).at(-1) === '');
  controlla('niente crash: il live continua a girare', (await live()).errore !== undefined && (await live()).livelli.length === 1);
  const avvisoUscita = await finche(async () => (await js(`document.getElementById('cue-avviso').textContent`)).includes('non collegata'));
  controlla('un avviso chiaro, che dice che riprende da sola', !!avvisoUscita && (await js(`document.getElementById('cue-avviso').textContent`)).includes('MiniFuse prova') && (await js(`document.getElementById('cue-avviso').textContent`)).includes('riprende da sola'), await js(`document.getElementById('cue-avviso').textContent`));
  await liveJs(`(() => { window.__finto.elenco = [{ deviceId: 'finto1', kind: 'audiooutput', label: 'MiniFuse prova', groupId: 'g' }]; navigator.mediaDevices.dispatchEvent(new Event('devicechange')); })()`);
  controlla('ricollegata, si riprende da sola', !!(await finche(async () => (await live()).uscita?.ok === true)) && (await liveJs('window.__finto.sink')).at(-1) === 'finto1', JSON.stringify((await live()).uscita));
  controlla('e lo dice', !!(await finche(async () => (await js(`document.getElementById('cue-avviso').textContent`)).includes('ripresa'))), await js(`document.getElementById('cue-avviso').textContent`));
  const testoLog2 = await readFile(fileLog, 'utf8').catch(() => '');
  controlla('nel registro c\'è la scheda scollegata e ripresa', /\[avviso\] \[(live|uscite)\].*non collegata/.test(testoLog2) && /\[info\] \[uscite\].*ripresa/.test(testoLog2));
  await liveJs(`(() => { const f = window.__finto; navigator.mediaDevices.enumerateDevices = f.enumera; AudioContext.prototype.setSinkId = f.setSink; delete window.__finto; })()`);
  await js(`window.cutx.salvaConfig({ uscite: ${JSON.stringify(configPrima)} })`);
  await aspetta(0.5);

  // --- il motore live crasha: si riavvia da solo e rimette quello che suonava, il CUE non si tocca ---
  await js(`cutxProva.fermaTutto()`);
  await js(`cutxProva.cue.cambiaModo('libero'); cutxProva.scegliEntraTra(1)`);
  await js(`cutxProva.valuta('live', 'setcpm(100/4)\\ns("sine*2").gain(.0001)')`); // il primo livello (libero), a 100 BPM
  await js(`cutxProva.scriviCue('// @sezione secondo\\ns("sine*4").gain(.0001)')`);
  await wc().executeJavaScript('cutxProva.goLive()');
  await aspetta(3);
  const prima = await live();
  const idLibero = prima.livelli.find((l) => l.nome === 'scratch')?.id;
  const idSecondo = prima.livelli.find((l) => l.nome === 'secondo')?.id;
  await js(`cutxProva.pila.azioni.volume(${idLibero}, 0.4); cutxProva.pila.azioni.muto(${idSecondo}, true)`);
  await aspetta(1);
  const testoCue = '// questo è il testo del CUE: non si perde\\nnote("c3 e3 g3").s("triangle").gain(.0001)';
  await js(`cutxProva.scriviCue('${testoCue}')`);
  const pidPrima = finestre.live.webContents.getOSProcessId();
  const intero = await live();
  controlla('prima del crash ci sono due livelli a 100 BPM', intero.livelli.filter((l) => l.a === null).length === 2 && Math.abs(intero.cps * 240 - 100) < 0.2, JSON.stringify([intero.livelli.length, intero.cps * 240]));
  await js(`window.cutx.crasha('live')`);
  const tornato = await finche(async () => {
    const f = finestre.live;
    if (!f || f.isDestroyed() || f.webContents.getOSProcessId() === pidPrima) return false;
    const s = await chiedi(f, 'globalThis.cutxStato?.()').catch(() => null);
    return s && s.livelli?.filter((l) => l.a === null).length === 2 ? s : false;
  }, 25);
  controlla('il live si riavvia da solo (un processo nuovo)', !!tornato && finestre.live.webContents.getOSProcessId() !== pidPrima);
  const dopo = tornato || (await live());
  controlla('e rimette gli stessi livelli, con volume e muto', dopo.livelli.some((l) => l.nome === 'scratch' && l.a === null && Math.abs(l.volume - 0.4) < 0.01) && dopo.livelli.some((l) => l.nome === 'secondo' && l.a === null && l.muto === true), JSON.stringify(dopo.livelli?.map((l) => [l.nome, l.a, l.volume, l.muto])));
  controlla('allo stesso tempo (100 BPM)', await finche(async () => Math.abs((await live()).cps * 240 - 100) < 0.5, 6), String((await live()).cps * 240));
  controlla('il testo del CUE è quello di prima', (await js('cutxProva.cue.libero.codice')) === testoCue.replace(/\\n/g, '\n'), await js('cutxProva.cue.libero.codice'));
  controlla('un avviso lo dice', (await js(`document.getElementById('cue-avviso').textContent`)).includes('il live si è riavviato'), await js(`document.getElementById('cue-avviso').textContent`));
  const testoLog3 = await readFile(fileLog, 'utf8').catch(() => '');
  controlla('nel registro: processo terminato e livelli rimessi', /\[errore\] \[live\] processo terminato/.test(testoLog3) && /\[avviso\] \[live\] riavviato: rimetto 2 livelli/.test(testoLog3));

  // --- l'interfaccia crasha: ripartita, si riprende il testo del CUE ---
  await js(`cutxProva.scriviCue('// bozza da non perdere\\ns("sine").gain(.0001)')`);
  await aspetta(1.3); // la bozza si salva dopo un attimo
  const pidUi = wc().getOSProcessId();
  await js(`window.cutx.crasha('controllo')`).catch(() => {});
  const ripartita = await finche(async () => {
    try {
      return wc().getOSProcessId() !== pidUi && (await js(`!!globalThis.cutxProva && !!document.querySelector('.cm-editor')`));
    } catch {
      return false;
    }
  }, 25);
  controlla('l\'interfaccia ripartita', !!ripartita);
  await primoPiano(finestre); // dopo un crash la finestra non è più quella attiva
  await aspetta(1);
  controlla('riprende il testo del CUE', (await js('cutxProva.cue.libero.codice')).includes('bozza da non perdere'), await js('cutxProva.cue.libero.codice'));
  controlla('e lo dice', (await js(`document.getElementById('cue-avviso').textContent`)).includes('ho ripreso il testo del CUE'), await js(`document.getElementById('cue-avviso').textContent`));
  await js('cutxProva.fermaTutto()');
  return ok;
}

// --- il codice sul proiettore: tutta l'altezza, mai sotto neon/gatto/frase, mai righe a metà; scorre se non ci sta ---

// Un livello lungo e realistico: tante righe, alcune molto lunghe (vanno a capo).
export const livelloLungo = (n, righe = 11) =>
  `// @sezione livello ${n}\nstack(\n${Array.from({ length: righe }, (_, k) => `  s("bd*${(k % 4) + 1} hh*${(k % 8) + 2} ~ sd:${k}").bank("RolandTR909").gain(${(0.3 + (k % 5) / 10).toFixed(1)}).room(.${k % 9}).delay(.${(k + n) % 7})`).join(',\n')}\n)`;

// Apre l'uscita a una certa dimensione, ci mette i livelli e controlla com'è il codice. ritorna le verifiche.
export async function provaCodiceUscita({ finestre, scrivi, controlla, js, quanti, righe, larghezza, altezza, etichetta }) {
  const wc = () => finestre.controllo.webContents;
  const uscita = () => finestre.uscita;
  const verifica = () => chiedi(uscita(), 'globalThis.cutxVerificaUscita?.()');
  const aperta = await js('window.cutx.uscitaAperta()');
  if (!aperta) await js('window.cutx.uscitaOnOff()');
  for (let i = 0; i < 40 && !finestre.uscita; i++) await aspetta(0.25);
  await aspetta(1.5);
  finestre.uscita.setContentSize(larghezza, altezza);
  await js(`cutxProva.fermaTutto(); cutxProva.valuta('live', 'setcpm(120/4)\\ns("sine*2").gain(.0001)')`);
  await aspetta(1);
  await js(`cutxProva.cue.cambiaModo('libero'); cutxProva.scegliEntraTra(1)`);
  for (let n = 1; n <= quanti; n++) {
    await js(`cutxProva.scriviCue(${JSON.stringify(livelloLungo(n, righe))})`);
    await wc().executeJavaScript('cutxProva.goLive()');
    await aspetta(2.6);
  }
  await aspetta(4); // la scrittura a macchina finisce
  const v = await verifica();
  controlla(`${etichetta}: nessuna riga tagliata a metà (${v.visibili} righe visibili)`, v.tagliate === 0 && v.visibili > 0, JSON.stringify(v));
  controlla(`${etichetta}: il codice non finisce sotto neon, gatto e numero di frase`, v.sovrappone === false, JSON.stringify(v));
  controlla(`${etichetta}: il carattere è leggibile da lontano (${Math.round(v.carattere)} px, minimo ${Math.round(v.minimo)})`, v.carattere >= v.minimo - 0.6, JSON.stringify(v));
  return v;
}

async function provaUscita({ finestre, scrivi }) {
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}${!vero && dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  const js = (codice) => chiedi(finestre.controllo, codice);
  const verifica = () => chiedi(finestre.uscita, 'globalThis.cutxVerificaUscita?.()');
  try {
    for (const [l, a] of [[1280, 720], [1920, 1080]]) {
      const base = { finestre, scrivi, controlla, js, larghezza: l, altezza: a };
      // due livelli lunghi: si rimpicciolisce il carattere, niente di tagliato
      const due = await provaCodiceUscita({ ...base, quanti: 2, righe: 1, etichetta: `${l}×${a}, 2 livelli` });
      controlla(`${l}×${a}, 2 livelli di codice normale: ci stanno tutti, senza scorrere`, due.ci === true && due.scorre === false, JSON.stringify(due));
      // cinque livelli lunghi: neanche al carattere minimo ci stanno, si scorre da soli
      const cinque = await provaCodiceUscita({ ...base, quanti: 5, righe: 11, etichetta: `${l}×${a}, 5 livelli lunghi` });
      controlla(`${l}×${a}, 5 livelli: si scorre da soli`, cinque.scorre === true && cinque.ci === false, JSON.stringify(cinque));
      controlla(`${l}×${a}, 5 livelli: il carattere resta al minimo leggibile, non più piccolo`, Math.abs(cinque.carattere - cinque.minimo) < 3, `${cinque.carattere} / ${cinque.minimo}`);
      // il livello appena entrato si vede subito
      controlla(`${l}×${a}: l'ultimo livello entrato è visibile (ci si ferma lì)`, cinque.focusVisibile === true && cinque.focus?.id !== undefined, JSON.stringify(cinque.focus));
      // lo scorrimento si muove, e a ogni passo non c'è mai una riga a metà
      const visti = new Set();
      let tagliate = 0;
      for (let i = 0; i < 40; i++) {
        const v = await verifica();
        visti.add(Math.round(v.offset));
        tagliate += v.tagliate;
        await aspetta(0.5);
      }
      controlla(`${l}×${a}: scorrendo non resta mai una riga a metà`, tagliate === 0, String(tagliate));
      controlla(`${l}×${a}: scorre piano (si muove, ma di una riga alla volta)`, visti.size >= 2, JSON.stringify([...visti]));
      // un livello nuovo: ci si ferma su di lui
      await js(`cutxProva.scriviCue(${JSON.stringify(livelloLungo(6, 6))})`);
      await finestre.controllo.webContents.executeJavaScript('cutxProva.goLive()');
      await aspetta(6);
      const nuovo = await verifica();
      controlla(`${l}×${a}: entra un livello nuovo e si scorre fino a lui`, nuovo.focusVisibile === true && !!nuovo.focus && nuovo.livelli.includes(nuovo.focus.id), JSON.stringify(nuovo.focus));
    }
  } finally {
    await js('cutxProva.fermaTutto()').catch(() => {});
    await js('window.cutx.uscitaAperta().then((a) => a && window.cutx.uscitaOnOff())').catch(() => {});
  }
  return ok;
}

// Le foto dello sfondo del proiettore (note e oscilloscopio) con qualche controllo: npx electron . --sfondo=<cartella>
export async function sfondo({ finestre, cartella }) {
  await mkdir(cartella, { recursive: true });
  const js = (codice) => chiedi(finestre.controllo, codice);
  const uscita = (codice) => chiedi(finestre.uscita, codice);
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    console.log(`[sfondo] ${vero ? 'OK   ' : 'FALLITO'} ${nome}${!vero && dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  await aspettaChe(async () => (await chiedi(finestre.live, 'globalThis.cutxStato?.()')) && (await js('!!globalThis.cutxProva')));
  await aspetta(1);
  if (!(await js('window.cutx.uscitaAperta()'))) await js('window.cutx.uscitaOnOff()');
  for (let i = 0; i < 40 && !finestre.uscita; i++) await aspetta(0.25);
  await aspetta(1.5);
  finestre.uscita.setContentSize(1280, 720);
  await js(`cutxProva.fermaTutto(); cutxProva.valuta('live', 'setcpm(124/4)\\ns("sine*2").gain(.0001)')`);
  await aspetta(1);
  await js(`cutxProva.cue.cambiaModo('libero'); cutxProva.scegliEntraTra(1)`);
  const livelli = [
    '// @sezione batteria\ns("bd*4, ~ cp ~ cp, hh*8").gain(.06)',
    '// @sezione basso\nnote("<c2 c2 eb2 g1>*4").s("sawtooth").lpf(500).gain(.06)',
    '// @sezione melodia\nn("0 3 7 <10 12> 7 3").scale("C:minor").s("triangle").room(.4).gain(.05)',
  ];
  for (const codice of livelli) {
    await js(`cutxProva.scriviCue(${JSON.stringify(codice)})`);
    await finestre.controllo.webContents.executeJavaScript('cutxProva.goLive()');
    await aspetta(2.8);
  }
  await aspetta(3);
  const foto = async (nome) => writeFile(path.join(cartella, `${nome}.png`), (await finestre.uscita.webContents.capturePage()).toPNG());
  const pixel = () => uscita(`(() => { const c = document.getElementById('sfondo'); if (c.hidden) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++; return n; })()`);

  await js(`window.cutx.salvaPreferenze({ sfondoProiettore: 'niente' })`);
  await aspetta(1);
  controlla('niente: il canvas è nascosto, nessun costo', (await pixel()) === -1);
  await foto('sfondo-niente');

  await js(`window.cutx.salvaPreferenze({ sfondoProiettore: 'note' })`);
  await aspetta(3);
  const note = await pixel();
  controlla('note: il pianoroll disegna', note > 500, String(note));
  await foto('sfondo-note');

  await js(`window.cutx.salvaPreferenze({ sfondoProiettore: 'oscilloscopio' })`);
  await aspetta(3);
  const onda = await pixel();
  const arrivata = await uscita('!!globalThis.cutxSfondo.onda');
  controlla("oscilloscopio: l'onda arriva dal live e si disegna", arrivata && onda > 500, `${arrivata} ${onda}`);
  await foto('sfondo-oscilloscopio');

  // costo del disegno, a 30 fotogrammi al secondo
  const ms = await uscita(`(() => { const s = globalThis.cutxSfondo; const t = performance.now(); for (let i = 0; i < 60; i++) { s.ultimo = 0; s.disegna(0, [], performance.now() + i * 40); } return (performance.now() - t) / 60; })()`);
  controlla(`oscilloscopio: il disegno costa ${ms.toFixed(2)} ms a fotogramma`, ms < 4, String(ms));

  // ⌃⌘B dal proiettore cambia lo sfondo: oscilloscopio → niente → note
  finestre.uscita.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'B', modifiers: ['control', 'meta'] });
  finestre.uscita.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'B', modifiers: ['control', 'meta'] });
  await aspetta(1.2);
  controlla('⌃⌘B dal proiettore: oscilloscopio → niente', (await js('window.cutx.preferenze()')).sfondoProiettore === 'niente');
  // e il live non manda più l'onda
  await aspetta(1);
  controlla("senza oscilloscopio il live non manda più l'onda", (await uscita('performance.now() - globalThis.cutxSfondo.ondaAl')) > 800);
  await js(`window.cutx.salvaPreferenze({ sfondoProiettore: 'niente' })`);
  console.log(ok ? '[sfondo] FATTO' : '[sfondo] CON PROBLEMI');
  return ok;
}

// Il saltino quando si salva: il click gira sul live, in mezzo si salva in vari modi e si guarda cosa si è sentito.
// Misura digitale (la sentinella del live ascolta l'uscita del motore): npx electron . --saltino
export async function saltino({ finestre }) {
  const stato = (ruolo) => chiedi(finestre[ruolo], 'globalThis.cutxStato?.()');
  const js = (codice) => chiedi(finestre.controllo, codice);
  await aspettaChe(async () => (await stato('live')) && (await stato('cuffia')) && (await js('!!globalThis.cutxProva')));
  await aspetta(2);
  await js(`cutxProva.avviaTest(${JSON.stringify(CODICE)})`);
  await aspetta(4);
  const rapporto = [];
  const fase = async (nome, azione, durata = 8) => {
    await chiedi(finestre.live, 'globalThis.cutxAzzeraMisure()');
    const tardiPrima = (await stato('live')).tardi;
    await aspetta(0.3);
    await azione();
    await aspetta(durata);
    const live = await stato('live');
    const s = live.sentinella;
    const r = { nome, sentiti: s.sentiti, persi: s.mancati, fuoriTempo: s.extra, tardi: live.tardi - tardiPrima, scartoMaxMs: Number(s.scartoMaxMs.toFixed(2)), giroMaxMs: Math.round(live.giroMax) };
    rapporto.push(r);
    console.log(`[saltino] ${nome.padEnd(34)} sentiti ${r.sentiti}, persi ${r.persi}, fuori tempo ${r.fuoriTempo}, tardi ${r.tardi}, scarto max ${r.scartoMaxMs} ms, giro max ${r.giroMaxMs} ms`);
  };
  const dieci = async (fa) => {
    for (let i = 0; i < 10; i++) {
      await fa(i);
      await aspetta(0.6);
    }
  };
  await js(`cutxProva.cue.cambiaModo('libero'); cutxProva.cue.fileLibero = 'saltino_prova.cutx'; cutxProva.scriviCue('// @brano saltino\\n// @sezione uno\\ns("sine")')`);
  const testo = (i) => JSON.stringify(`// @brano saltino\n// @bpm 120\n// @sezione uno\ns("sine*${i + 1}")\n`);
  await fase('base (niente)', () => aspetta(6));
  await fase('solo la scrittura del file (x10)', () => dieci((i) => js(`window.cutx.scriviBrano('saltino_prova.cutx', ${testo(i)}, { sovrascrivi: true })`)));
  // il salvataggio non deve mandare niente ai motori (a parte i ping): si contano i messaggi
  await js(`globalThis.__tipi = []; for (const m of [cutxProva.motori.live, cutxProva.motori.cuffia]) { const f = m.manda.bind(m); m.manda = (x) => (globalThis.__tipi.push(m.ruolo + ':' + x.tipo), f(x)); }`);
  await fase('⌘S completo dell\'interfaccia (x10)', () => dieci(() => js('cutxProva.cue.salva()')));
  const tipi = [...new Set((await js('globalThis.__tipi')).filter((t) => !t.endsWith(':ping')))];
  console.log(`[saltino] ${tipi.length === 0 ? 'OK   ' : 'FALLITO'} ⌘S non manda niente ai motori (a parte i ping)${tipi.length ? ` · ${tipi.join(', ')}` : ''}`);
  await fase('controllo: i motori rileggono lo stash', () => dieci(() => js('window.cutx.rileggiStash()')));
  // una libreria grande: 300 brani (file finti, tolti alla fine)
  const libreria = path.join(stash.radice(), 'libreria');
  const finti = Array.from({ length: 300 }, (_, i) => path.join(libreria, `saltino_zz_${i}.cutx`));
  for (const f of finti) await writeFile(f, '// @brano finto\n// @bpm 120\n// @sezione uno\ns("sine*2")\n// @sezione due\ns("hh*8")\n');
  await js('window.cutx.rileggiStash()');
  await aspetta(1);
  await fase('con 300 brani: ⌘S (x10)', () => dieci(() => js('cutxProva.cue.salva()')));
  for (const f of finti) await rm(f, { force: true });
  // un suono nuovo nello stash: i motori lo aggiungono mentre suona
  const cartellaSuono = path.join(stash.radice(), 'suoni', 'zz_saltino');
  await mkdir(cartellaSuono, { recursive: true });
  const wav = Buffer.alloc(44 + 8820 * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(88200, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(8820 * 2, 40);
  await writeFile(path.join(cartellaSuono, 'uno.wav'), wav);
  await fase('un suono nuovo nello stash (x1)', () => js('window.cutx.rileggiStash()'));
  await rm(cartellaSuono, { recursive: true, force: true });
  await js('window.cutx.rileggiStash()');
  console.log(`[saltino] JSON ${JSON.stringify(rapporto)}`);
  await rm(path.join(stash.radice(), 'libreria', 'saltino_prova.cutx'), { force: true });
  return true;
}


// --- dissolvenze: entrata, uscita, annullo, paracadute, panico, volume della sezione (npx electron . --prova=dissolvenze) ---
async function provaDissolvenze({ finestre, scrivi }) {
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}${!vero && dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  const js = (codice) => chiedi(finestre.controllo, codice);
  const live = () => chiedi(finestre.live, 'globalThis.cutxStato?.()');
  const livello = async (nome) => (await live()).livelli.filter((l) => l.nome === nome).at(-1);
  const fade = async (nome) => {
    const s = await live();
    const l = s.livelli.filter((x) => x.nome === nome).at(-1);
    return l ? s.dissolvenze[l.id] : null;
  };
  const entra = (nome, extra = {}) => js(`cutxProva.motori.live.richiesta(${JSON.stringify({ tipo: 'entra', codice: 's("sine*4").gain(.03)', nome, provenienza: 'prova', cicli: 1, ...extra })})`);
  const tipo = 'filtro';

  // 1. i filtri aperti sono l'identità: rumore dentro, lo stesso rumore fuori
  const identita = await js(`(async () => {
    const sr = 48000, n = 48000;
    const off = new OfflineAudioContext(1, n, sr);
    const buf = off.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = new AudioBufferSourceNode(off, { buffer: buf });
    const lp = new BiquadFilterNode(off, { type: 'lowpass', frequency: sr / 2, Q: 0.707 });
    const hp = new BiquadFilterNode(off, { type: 'highpass', frequency: 0, Q: 0.707 });
    src.connect(lp).connect(hp).connect(off.destination);
    src.start();
    const out = (await off.startRendering()).getChannelData(0);
    let max = 0;
    for (let i = 0; i < n; i++) max = Math.max(max, Math.abs(out[i] - d[i]));
    return max;
  })()`);
  controlla('i filtri aperti sono l\'identità (passa-basso a Nyquist, passa-alto a 0 Hz)', identita !== null && identita < 1e-6, String(identita));

  await js(`cutxProva.fermaTutto(); cutxProva.valuta('live', 'setcpm(480/4)\\ns("sine*2").gain(.0001)')`);
  await aspetta(1.5);

  // 2. entra con una dissolvenza di 2 cicli (1 s a questo tempo): volume 0 → 1 e passa-basso che si apre
  const d2 = { cicli: 2, tipo, filtroUscita: 'hp' };
  await entra('basso', { dissolvenza: d2 });
  let visto = [];
  for (let i = 0; i < 40; i++) {
    const f = await fade('basso');
    if (f) visto.push(f);
    await aspetta(0.06);
  }
  const fadeVisti = visto.map((f) => f.fade);
  controlla('entra: il volume sale piano da 0 a 1', Math.min(...fadeVisti) < 0.2 && Math.max(...fadeVisti) > 0.97 && fadeVisti.some((v) => v > 0.2 && v < 0.9), JSON.stringify(fadeVisti.map((v) => +v.toFixed(2))));
  const lpVisti = visto.map((f) => f.lp);
  controlla('entra: il passa-basso si apre (poi è aperto del tutto)', Math.min(...lpVisti) < 1500 && lpVisti.at(-1) > 20000, JSON.stringify(lpVisti.map(Math.round)));
  const a = await fade('basso');
  controlla('finita l\'entrata il livello è com\'è sempre (volume 1, filtri aperti)', a && a.fade > 0.99 && a.lp > 20000 && a.hp < 1, JSON.stringify(a));

  // 3. togli con 2 cicli: continua a suonare e sfuma; la card si attenua; poi sparisce
  await js(`cutxProva.motori.live.manda({ tipo: 'togli', livello: ${(await livello('basso')).id}, dissolvenza: ${JSON.stringify(d2)} })`);
  await aspetta(0.2);
  const l1 = await livello('basso');
  controlla('togli con dissolvenza: il livello non esce di botto (a = confine + 2 cicli)', l1.a !== null && l1.sfuma?.verso === 'esce' && l1.sfuma.a - l1.sfuma.da === 2, JSON.stringify(l1));
  await aspetta(0.4);
  controlla('la card resta, attenuata, con la barra di quanto manca', await js(`(() => { const c = document.querySelector('#livelli .card.livello.sfuma'); return !!c && !c.querySelector('.barra-arrivo').hidden && c.querySelector('.barra-arrivo > div').style.width !== '' && Number(getComputedStyle(c).opacity) < 0.9; })()`));
  // un secondo togli la salva
  await js(`cutxProva.motori.live.manda({ tipo: 'togli', livello: ${l1.id}, dissolvenza: ${JSON.stringify(d2)} })`);
  await aspetta(0.5);
  const l2 = await livello('basso');
  const f2 = await fade('basso');
  controlla('un secondo togli annulla l\'uscita: torna al suo volume', l2.a === null && l2.sfuma === null && f2.fade > 0.97 && f2.hp < 5, JSON.stringify({ l2, f2 }));
  // un clic sulla card che sfuma la salva
  await js(`cutxProva.motori.live.manda({ tipo: 'togli', livello: ${l1.id}, dissolvenza: ${JSON.stringify(d2)} })`);
  await aspetta(0.5);
  await js(`document.querySelector('#livelli .card.livello.sfuma .barra-arrivo')?.click()`);
  await aspetta(0.5);
  controlla('un clic sulla card che sfuma salva il livello', (await livello('basso')).a === null);
  // lasciato sfumare, esce del tutto
  await js(`cutxProva.motori.live.manda({ tipo: 'togli', livello: ${l1.id}, dissolvenza: ${JSON.stringify(d2)} })`);
  let minimo = 1;
  let sparito = false;
  for (let i = 0; i < 50 && !sparito; i++) {
    const f = await fade('basso');
    if (f) minimo = Math.min(minimo, f.fade);
    sparito = !(await livello('basso'));
    await aspetta(0.1);
  }
  controlla('lasciato sfumare, il volume scende a 0 e il livello esce', sparito && minimo < 0.5, `minimo ${minimo}`); // (il livello se ne va dalla lista un attimo prima della fine: ha già programmato l'ultimo colpo)

  // 4. senza dissolvenza tutto è come prima: di botto, a fine ciclo
  await entra('secco');
  await aspetta(1.2);
  await js(`cutxProva.motori.live.manda({ tipo: 'togli', livello: ${(await livello('secco')).id}, dissolvenza: { cicli: 0, tipo: 'volume', filtroUscita: 'hp' } })`);
  await aspetta(0.03);
  const secco = await livello('secco');
  controlla('dissolvenza 0: esce di botto a fine ciclo, senza sfumata', !!secco && secco.sfuma === null && secco.a !== null && secco.a - (await live()).ciclo < 1.01);

  // 5. sostituire un livello con uno dello stesso nome: i due si scambiano
  await entra('scambio');
  await aspetta(1.2);
  await entra('scambio', { dissolvenza: { cicli: 1, tipo: 'volume' } });
  await aspetta(0.3);
  const livelliScambio = (await live()).livelli.filter((l) => l.nome === 'scambio');
  const vecchio = livelliScambio[0];
  const nuovo = livelliScambio.at(-1);
  controlla('sostituzione con dissolvenza: il vecchio sfuma mentre entra il nuovo', livelliScambio.length === 2 && vecchio.sfuma?.verso === 'esce' && nuovo.sfuma?.verso === 'entra' && vecchio.a === nuovo.da + 1, JSON.stringify(livelliScambio.map((l) => [l.da, l.a, l.sfuma])));

  // 6. il paracadute è una transizione: quello che suona sfuma col passa-alto, lui entra col passa-basso
  await js(`cutxProva.fermaTutto()`);
  await aspetta(0.5);
  await entra('uno');
  await entra('due');
  await aspetta(1.5);
  await js(`cutxProva.motori.live.richiesta(${JSON.stringify({ tipo: 'paracadute', codice: 's("sine*2").gain(.02)', dissolvenza: { cicli: 2, tipo: 'filtro', filtroUscita: 'hp' } })})`);
  await aspetta(0.15);
  const sp = (await live()).livelli;
  const paracaduteL = sp.find((l) => l.nome === 'paracadute');
  const usciti = sp.filter((l) => l.nome !== 'paracadute');
  controlla('paracadute: tutti i livelli escono sfumando e lui entra sfumando, agganciati', paracaduteL?.sfuma?.verso === 'entra' && usciti.length === 2 && usciti.every((l) => l.sfuma?.verso === 'esce' && l.a === paracaduteL.da + 2 && l.sfuma.da === paracaduteL.da), JSON.stringify(sp.map((l) => [l.nome, l.da, l.a, l.sfuma])));
  let hpMax = 0;
  for (let i = 0; i < 20; i++) {
    const s = await live();
    for (const l of s.livelli.filter((x) => x.nome !== 'paracadute')) hpMax = Math.max(hpMax, s.dissolvenze[l.id]?.hp ?? 0);
    await aspetta(0.08);
  }
  controlla('paracadute: il passa-alto di quello che esce sale', hpMax > 100, String(hpMax));

  // 7. ⌘. è il panico: niente dissolvenza, tutto si zittisce subito
  await js(`cutxProva.motori.live.manda({ tipo: 'ferma' })`);
  await aspetta(0.2);
  controlla('⌘. ferma tutto subito, senza dissolvenza', (await live()).livelli.length === 0);

  // 8. il volume scritto nella sezione: nel file, nell'intestazione, e il livello entra a quel volume
  await js(`cutxProva.cue.cambiaModo('libero'); cutxProva.scriviCue(${JSON.stringify('// @brano volume\n// @sezione piano · volume 0.4\ns("sine*2").gain(.02)\n')})`);
  await aspetta(0.3);
  await js(`cutxProva.scegliEntraTra(1); cutxProva.goLive()`);
  await aspetta(1.5);
  const piano = await livello('piano');
  const gv = piano ? (await live()).guadagni[piano.id] : null;
  controlla('la sezione entra al volume scritto nell\'intestazione (0,4)', piano && piano.volume === 0.4 && Math.abs(gv - 0.4) < 0.05, JSON.stringify({ piano: piano?.volume, gv }));
  await js(`cutxProva.fermaTutto()`);
  return ok;
}


// --- scrittura umana sul proiettore: da zero, solo la differenza, una modifica per volta, sincronia con l'entrata ---
async function provaScrittura({ finestre, scrivi }) {
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}${!vero && dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  const js = (codice) => chiedi(finestre.controllo, codice);
  const uscita = () => chiedi(finestre.uscita, 'globalThis.cutxScrittura?.()');
  await js('window.cutx.salvaPreferenze({ scritturaAMacchina: true, scrittura: { velocita: 1, imperfezione: 0.5, refusi: 0 }, testiPubblico: {} })');
  if (!(await js('window.cutx.uscitaAperta()'))) await js('window.cutx.uscitaOnOff()');
  for (let i = 0; i < 40 && !finestre.uscita; i++) await aspetta(0.25);
  await aspetta(1.5);
  finestre.uscita.setContentSize(1280, 720);
  await js(`cutxProva.fermaTutto(); cutxProva.valuta('live', 'setcpm(240/4)\\ns("sine*2").gain(.0001)')`);
  await aspetta(1);
  const entra = (nome, codice, cicli) => js(`cutxProva.motori.live.richiesta(${JSON.stringify({ tipo: 'entra', codice, nome, provenienza: 'prova', cicli })})`);
  const A = 's("bd*4, hh*8").gain(.01)\n  .room(.3)';
  const B = 's("bd*16, hh*8").gain(.01)\n  .room(.3)';
  const C = 's("bd*16, hh*8").gain(.01)\n  .room(.9)';

  // 1. da zero: si scrive piano e finisce quando entra
  await entra('batt', A, 4);
  let campioni = [];
  let fine = null;
  let arrivato = false;
  for (let i = 0; i < 300; i++) {
    const u = await uscita();
    const b = u?.blocchi.find((x) => x.tag.includes('batt'));
    const arrivo = u?.arrivi.find((x) => x.nome === 'batt');
    if (arrivo) {
      fine = arrivo.fine;
      arrivato = true;
    }
    if (b) campioni.push({ t: u.epoca, v: b.visibile, c: b.cursore });
    if (arrivato && !arrivo) {
      await aspetta(0.3);
      const dopo = await uscita();
      const bb = dopo?.blocchi.find((x) => x.tag.includes('batt'));
      if (bb) campioni.push({ t: dopo.epoca, v: bb.visibile, c: bb.cursore });
      break;
    }
    await aspetta(0.05);
  }
  const lung = campioni.map((x) => x.v.length);
  controlla('da zero: il testo cresce un carattere alla volta, mai all indietro', lung.some((n) => n > 0 && n < A.length) && lung.every((n, i) => i === 0 || n >= lung[i - 1]), JSON.stringify(lung.slice(0, 40)));
  const ultimo = campioni.find((x) => x.v === A && !x.c);
  controlla("l'ultimo carattere arriva quando il suono entra (±250 ms)", ultimo && fine && Math.abs(ultimo.t - fine) < 250, JSON.stringify({ dt: ultimo && fine ? Math.round(ultimo.t - fine) : null, ultimi: campioni.slice(-5).map((x) => [Math.round(x.t - fine), x.v.length, x.c]) }));
  await aspetta(0.5);

  // 2. una modifica sullo stesso nome: non si riscrive tutto, il cursore sta nel punto che cambia
  await entra('batt', B, 4);
  campioni = [];
  fine = null;
  arrivato = false;
  for (let i = 0; i < 300; i++) {
    const u = await uscita();
    const blocchi = u?.blocchi.filter((x) => x.tag.includes('batt')) ?? [];
    const arrivo = u?.arrivi.find((x) => x.nome === 'batt');
    if (arrivo) {
      fine = arrivo.fine;
      arrivato = true;
    }
    if (blocchi.length) campioni.push({ t: u.epoca, blocchi: blocchi.map((b) => b.visibile), n: blocchi.length, c: blocchi.some((b) => b.cursore) });
    if (arrivato && !arrivo) {
      await aspetta(0.3);
      const dopo = await uscita();
      const bl = dopo?.blocchi.filter((x) => x.tag.includes('batt')) ?? [];
      campioni.push({ t: dopo.epoca, blocchi: bl.map((b) => b.visibile), n: bl.length, c: bl.some((b) => b.cursore) });
      break;
    }
    await aspetta(0.05);
  }
  const intermedi = campioni.filter((x) => x.c && x.n === 1);
  controlla('modifica: un solo blocco, non due (il vecchio non resta a fianco)', campioni.length > 0 && campioni.slice(0, -1).every((x) => x.n === 1), JSON.stringify(campioni.map((x) => x.n)));
  controlla('modifica: all inizio si vede ancora il codice di prima (non si riparte da zero)', intermedi.length > 0 && intermedi[0].blocchi[0].length >= A.length - 4, JSON.stringify(intermedi[0]?.blocchi));
  controlla('modifica: si cancella solo il tratto cambiato (la riga .room resta sempre)', intermedi.every((x) => x.blocchi[0].includes('.room(.3)')), JSON.stringify(intermedi.filter((x) => !x.blocchi[0].includes('.room(.3)')).slice(0, 2)));
  const finito = campioni.at(-1);
  controlla('modifica: alla fine c è il codice nuovo', finito?.blocchi[0] === B, JSON.stringify(finito));

  // 3. una modifica per volta: se ne arriva un altra mentre scrive, la prima finisce di corsa
  await entra('batt', C, 6);
  await aspetta(1.5);
  const D = 's("bd*16, hh*8").gain(.01)\n  .room(.9).delay(.4)';
  await entra('batt', D, 8);
  const t0 = Date.now();
  let vistoC = false;
  const vistiRush = [];
  for (let i = 0; i < 40 && Date.now() - t0 < 1600; i++) {
    const u = await uscita();
    const b = u?.blocchi.find((x) => x.tag.includes('batt'));
    vistiRush.push(b ? b.visibile : -1);
    if (b && (b.visibile + '').includes('.room(.9)') && !(b.visibile + '').includes('.delay(.4)')) vistoC = true;
    await aspetta(0.05);
  }
  controlla('una modifica per volta: la prima si finisce di corsa, poi parte la nuova', vistoC, JSON.stringify([...new Set(vistiRush)]));
  for (let i = 0; i < 200; i++) {
    const u = await uscita();
    if (!u?.arrivi.length) break;
    await aspetta(0.1);
  }
  await aspetta(0.5);
  const u2 = await uscita();
  controlla('alla fine c è il codice dell ultima modifica', u2.blocchi.find((x) => x.tag.includes('batt'))?.visibile === D, JSON.stringify(u2.blocchi.map((b) => b.visibile)));
  await js('cutxProva.fermaTutto()');
  return ok;
}


// --- la proposta grafica dello specchio del controller (solo uno screenshot: npx electron . --prova=specchio-aspetto) ---
async function provaSpecchioAspetto({ finestre, scrivi }) {
  const js = (codice) => chiedi(finestre.controllo, codice);
  await js(`(() => {
    const stile = document.createElement('style');
    stile.textContent = \`
      .spec { border-top:1px solid var(--linea); padding:10px 12px 12px; font-family:var(--mono); }
      .spec-testa { display:flex; align-items:center; gap:8px; font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:var(--secondario); margin-bottom:8px; }
      .spec-testa .pag { border:1px solid var(--grigio,#3a3a38); padding:1px 6px; color:var(--spento,#7a7e72); }
      .spec-testa .pag.on { background:var(--testo); color:#050604; border-color:var(--testo); }
      .spec-testa .nome-pag { color:var(--testo); }
      .spec-griglia { display:grid; grid-template-columns:repeat(4,1fr); gap:8px 4px; }
      .spec-m { display:flex; flex-direction:column; align-items:center; gap:1px; padding:4px 0 3px; border:1px solid transparent; border-radius:3px; min-width:0; }
      .spec-m.toccata { border-color:var(--marcio); background:rgba(159,194,58,.07); }
      .spec-m svg { display:block; }
      .spec-m .n { font-size:10px; color:var(--secondario); }
      .spec-m .nm { font-size:10px; letter-spacing:.04em; color:var(--testo); max-width:64px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .spec-m .v { font-size:10px; color:var(--marcio); }
      .spec-m.libera .nm, .spec-m.libera .v { color:var(--spento,#7a7e72); }
      .spec-m.muta .nm { color:var(--spento,#7a7e72); text-decoration:line-through; }
      .spec-m.muta .v { color:var(--spento,#7a7e72); }
      .spec + .spec { margin-top:0; }
    \`;
    document.head.append(stile);
    const P = (a) => ({ x: 20 + 14 * Math.cos(a), y: 20 + 14 * Math.sin(a) });
    const A0 = 135 * Math.PI / 180, A1 = 405 * Math.PI / 180;
    const arco = (da, a, col, w = 3) => { const p = P(da), q = P(a); const grande = (a - da) > Math.PI ? 1 : 0; return \`<path d="M\${p.x} \${p.y} A14 14 0 \${grande} 1 \${q.x} \${q.y}" fill="none" stroke="\${col}" stroke-width="\${w}" stroke-linecap="round"/>\`; };
    const anello = (tipo, v) => {
      const trac = arco(A0, A1 - 0.001, '#26281f');
      if (tipo === 'libera') return \`<svg width="38" height="38" viewBox="0 0 40 40">\${arco(A0, A1 - 0.001, '#1b1d16', 2)}</svg>\`;
      if (tipo === 'muta') return \`<svg width="38" height="38" viewBox="0 0 40 40">\${trac}</svg>\`;
      if (tipo === 'fan') return \`<svg width="38" height="38" viewBox="0 0 40 40">\${trac}\${v > 0.01 ? arco(A0, A0 + (A1 - A0) * v, '#9fc23a') : ''}</svg>\`;
      if (tipo === 'centro') { const m = (A0 + A1) / 2, e = m + (A1 - A0) * (v - 0.5); return \`<svg width="38" height="38" viewBox="0 0 40 40">\${trac}\${Math.abs(v - 0.5) > 0.01 ? arco(Math.min(m, e), Math.max(m, e), '#9fc23a') : ''}</svg>\`; }
      const a = A0 + (A1 - A0) * v, p = P(a);
      return \`<svg width="38" height="38" viewBox="0 0 40 40">\${trac}<circle cx="\${p.x}" cy="\${p.y}" r="3.2" fill="#9fc23a"/></svg>\`;
    };
    const manopola = (n, nome, tipo, v, testo, extra = '') => \`<div class="spec-m \${extra}">\${anello(tipo, v)}<span class="nm">\${nome}</span><span class="v">\${testo}</span></div>\`;
    const scatola = (pag, titolo, manopole) => \`<div class="spec"><div class="spec-testa"><span>x-touch mini</span><span class="pag \${pag === 'A' ? 'on' : ''}">A</span><span class="pag \${pag === 'B' ? 'on' : ''}">B</span><span class="nome-pag">\${titolo}</span></div><div class="spec-griglia">\${manopole}</div></div>\`;
    const a = scatola('A', 'suona',
      manopola(1, 'drum', 'fan', 0.8, '0.80') +
      manopola(2, 'basso', 'fan', 0.55, '0.55', 'toccata') +
      manopola(3, 'melodia', 'muta', 0, 'muto', 'muta') +
      manopola(4, 'pad', 'fan', 0.3, '0.30') +
      manopola(5, '–', 'libera', 0, '', 'libera') + manopola(6, '–', 'libera', 0, '', 'libera') + manopola(7, '–', 'libera', 0, '', 'libera') +
      manopola(8, 'generale', 'fan', 1, '1.00'));
    const b = scatola('B', 'scolpisci · basso',
      manopola(1, 'volume', 'fan', 0.55, '0.55') +
      manopola(2, 'filtro', 'punto', 0.36, '800', 'toccata') +
      manopola(3, 'risonanza', 'punto', 0, '0.0') +
      manopola(4, 'eco', 'punto', 0.2, '0.20') +
      manopola(5, 'riverbero', 'punto', 0.1, '0.10') +
      manopola(6, '–', 'libera', 0, '', 'libera') + manopola(7, 'sporco', 'punto', 0, '0.00') + manopola(8, '–', 'libera', 0, '', 'libera'));
    const aiuto = document.getElementById('riquadro-help');
    aiuto.insertAdjacentHTML('beforebegin', a + b);
    document.getElementById('elenco').style.maxHeight = '120px';
  })()`);
  await aspetta(0.8);
  const cartella = path.join(os.homedir(), 'Desktop', 'cutx-schermate', 'controller');
  await mkdir(cartella, { recursive: true });
  await writeFile(path.join(cartella, 'specchio-proposta.png'), (await finestre.controllo.webContents.capturePage()).toPNG());
  scrivi(`OK    foto in ${cartella}/specchio-proposta.png`);
  return true;
}

// --- il controller: messaggi MIDI finti (niente hardware) dentro l'app vera: manopole, push, tasti, pagine, luci, monitor (npx electron . --prova=controller) ---
async function provaController({ finestre, scrivi }) {
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}${!vero && dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  const js = (codice) => chiedi(finestre.controllo, codice);
  const live = () => chiedi(finestre.live, 'globalThis.cutxStato?.()');
  const attivi = async () => (await live()).livelli.filter((l) => l.a === null);
  const midi = (...b) => js(`cutxProva.controllerMidi.riceve(${JSON.stringify(b)})`);
  const giro = (n, passi) => midi(0xb0, 15 + n, passi > 0 ? passi : 0x40 | -passi);
  const push = (n, giu) => midi(0x90, 31 + n, giu ? 127 : 0);
  const tasto = (i) => js(`cutxProva.controllerMidi.tab.tasti[${i - 1}]`);
  await js(`window.cutx.salvaPreferenze({ testiPubblico: {}, controller: null })`);
  await js(`cutxProva.fermaTutto(); cutxProva.controllerMidi.modo = 'MC'; cutxProva.controllerMidi.pagina = 'A'`);
  await aspetta(0.5);
  const entra = (nome, extra = {}) => js(`cutxProva.motori.live.richiesta(${JSON.stringify({ tipo: 'entra', codice: 's("sine*8").gain(.0001).lpf(800)', nome, provenienza: 'prova', cicli: 1, ...extra })})`);
  const uno = await entra('uno');
  const due = await entra('due');
  await aspetta(2.8);
  await js(`cutxProva.motori.live.manda({ tipo: 'livello', livello: ${due.livello}, volume: 0.5 })`);
  await aspetta(0.6);

  // pagina A: volume, muto, filtro
  await js(`cutxProva.controllerMidi.porta.ingresso = { state: 'connected', name: 'X-TOUCH MINI' }; cutxProva.controllerMidi.cambiato()`);
  await giro(2, 5);
  controlla('la card della manopola si illumina un attimo', (await js(`document.querySelectorAll('#livelli .card.livello.toccata').length`)) === 1);
  await aspetta(0.6);
  const v = (await attivi()).find((l) => l.id === due.livello)?.volume;
  controlla('manopola 2: il volume del secondo livello sale (0,5 → 0,6)', Math.abs(v - 0.6) < 0.011, String(v));
  await push(2, true);
  await aspetta(0.1);
  await push(2, false);
  await aspetta(0.5);
  controlla('un tocco sul push 2: muto', (await attivi()).find((l) => l.id === due.livello)?.muto === true);
  await push(2, true);
  await aspetta(0.1);
  await push(2, false);
  await aspetta(0.5);
  controlla('un secondo tocco: torna a suonare', (await attivi()).find((l) => l.id === due.livello)?.muto === false);
  await push(2, true);
  await aspetta(0.6);
  for (let i = 0; i < 12; i++) await giro(2, 1);
  await aspetta(0.5);
  await push(2, false);
  await aspetta(0.5);
  const l2 = (await attivi()).find((l) => l.id === due.livello);
  controlla('tenuta premuta + giro: il filtro entra nella coda del livello (e il muto non scatta)', /^\.lpf\(\d+\)$/.test(l2?.coda?.[0] ?? '') && l2.muto === false && Number(l2.coda[0].match(/\d+/)[0]) > 800, JSON.stringify([l2?.coda, l2?.muto]));
  controlla('e il livello è quello scelto (bordo verde)', (await js('cutxProva.pila.selezionato')) === due.livello);
  await aspetta(0.3);
  const spec = await js(`(() => {
    const m = [...document.querySelectorAll('#specchio .spec-m')];
    return { visibile: !document.getElementById('specchio').hidden, n: m.length, righe: new Set(m.map((x) => x.offsetTop)).size, nomi: m.map((x) => x.querySelector('.nm').textContent), info: document.querySelector('#specchio .spec-info')?.textContent, a: document.querySelector('#specchio .pag.on')?.textContent, toccata: m.findIndex((x) => x.classList.contains('toccata')) + 1 };
  })()`);
  controlla('lo specchio: otto manopole in una riga sola, nomi di al massimo 6 lettere', spec.visibile && spec.n === 8 && spec.righe === 1 && spec.nomi.every((n) => n.length <= 6), JSON.stringify(spec));
  controlla('lo specchio: in testata il nome intero e il valore dell\'ultima toccata (volume), la pagina A accesa, la manopola 2 in evidenza', /^DUE · VOLUME|^DUE · FILTRO \d+ Hz/.test(spec.info) && spec.a === 'A' && spec.toccata === 2, JSON.stringify(spec));
  try {
    const cartella = path.join(os.homedir(), 'Desktop', 'cutx-schermate', 'controller');
    await mkdir(cartella, { recursive: true });
    await writeFile(path.join(cartella, 'specchio.png'), (await finestre.controllo.webContents.capturePage()).toPNG());
  } catch {}
  controlla('niente scritta gigante al centro', (await js(`document.getElementById('scritta-controller')`)) === null);

  controlla('sulle card il numero della manopola che le comanda (②)', (await js(`[...document.querySelectorAll('#livelli .card.livello .manopola-n')].map((x) => x.textContent).join('')`)).includes('②'));
  // pagina B
  await midi(0x90, 85, 127);
  controlla('il tasto layer B porta alla pagina B, e lo dice la riga sottile in basso (non una scritta gigante)', (await js('cutxProva.controllerMidi.pagina')) === 'B' && /pagina B/.test(await js(`document.getElementById('riga-controller').textContent`)) && (await js(`document.getElementById('riga-controller').classList.contains('visibile')`)) === true);
  await midi(0x90, await tasto(1), 127);
  await midi(0x90, await tasto(1), 0);
  await giro(4, 10);
  await aspetta(0.6);
  const l1 = (await attivi()).find((l) => l.id === uno.livello);
  controlla('pagina B: il tasto 1 sceglie il livello 1 e la manopola 4 scrive l\'eco nella sua coda', /^\.delay\(0\.\d+\)$/.test(l1?.coda?.find((x) => x.startsWith('.delay')) ?? ''), JSON.stringify(l1?.coda));
  await midi(0x90, 84, 127);
  controlla('il tasto layer A torna alla pagina A', (await js('cutxProva.controllerMidi.pagina')) === 'A');

  // tasti: go live dal CUE
  const prima = (await attivi()).length;
  await js(`cutxProva.cue.cambiaModo('libero'); cutxProva.scriviCue('s("sine*4").gain(.0001)')`);
  await midi(0x90, await tasto(5), 127);
  await midi(0x90, await tasto(5), 0);
  await aspetta(2.8);
  controlla('il tasto 5 (alto) è go live: entra un livello', (await attivi()).length === prima + 1, String((await attivi()).length));

  // luci: i valori veri sugli anelli
  const inviati = await js(`(() => {
    const c = cutxProva.controllerMidi;
    const log = [];
    c.porta.uscita = { send: (b) => log.push([...b]) };
    c.ultime.clear();
    c.luci();
    return log;
  })()`);
  const anello1 = inviati.find((m) => m[0] === 0xb0 && m[1] === 0x30);
  controlla('le luci: anello 1 e tasto layer A (84) acceso', !!anello1 && inviati.some((m) => m[0] === 0x90 && m[1] === 84 && m[2] === 127), JSON.stringify(inviati.slice(0, 4)));
  const dopoDue = await js(`(() => { const c = cutxProva.controllerMidi; const log = []; c.porta.uscita = { send: (b) => log.push([...b]) }; c.luci(); return log.length; })()`);
  controlla('le luci già mandate non si rimandano', dopoDue === 0, String(dopoDue));

  // la pagina delle impostazioni: stato, monitor
  await js(`document.getElementById('apri-impostazioni').click()`);
  await aspetta(0.4);
  await js(`document.querySelector('#imp-nav [data-sez="controller"]').click()`);
  await aspetta(0.4);
  await giro(3, 2);
  await aspetta(0.5);
  const monitor = await js(`document.getElementById('ctl-monitor').innerText`);
  controlla('il monitor dice cosa riceve in parole e in piccolo il messaggio grezzo', /manopola 3 → \+2/.test(monitor) && /b0 12 02/.test(monitor), JSON.stringify(monitor));
  try {
    const cartella = path.join(os.homedir(), 'Desktop', 'cutx-schermate', 'controller');
    await mkdir(cartella, { recursive: true });
    await writeFile(path.join(cartella, 'pagina.png'), (await finestre.controllo.webContents.capturePage()).toPNG());
  } catch {}
  await midi(0xba, 1, 20);
  await aspetta(0.4);
  const stato = await js(`document.getElementById('ctl-stato').innerText`);
  controlla('se parla in standard lo dice e dà le istruzioni (tasto MC tenuto mentre si collega l\'USB)', /standard/.test(stato) && /MC MODE/.test(stato) && /tasto MC/.test(stato), JSON.stringify(stato));
  await js(`cutxProva.controllerMidi.modo = 'MC'; cutxProva.controllerMidi.cambiato()`);
  await aspetta(0.3);
  controlla('i bottoni «prova luci» e «calibra» ci sono', (await js(`document.querySelectorAll('#ctl-luci button').length`)) === 4 && (await js(`document.querySelectorAll('#ctl-calibra button').length`)) >= 1);

  // la scritta sul proiettore: spenta di default, accesa dai testi per il pubblico
  if (!(await js('window.cutx.uscitaAperta()'))) await js('window.cutx.uscitaOnOff()');
  for (let i = 0; i < 40 && !finestre.uscita; i++) await aspetta(0.25);
  await aspetta(1.5);
  await js(`document.getElementById('chiudi-impostazioni').click()`);
  await giro(1, 1);
  await aspetta(0.5);
  controlla('la scritta del controller sul proiettore è spenta di default', (await chiedi(finestre.uscita, `document.getElementById('scritta').hidden`)) === true);
  await js(`window.cutx.salvaPreferenze({ testiPubblico: { controller: { acceso: true } } })`);
  await aspetta(0.6);
  await giro(1, 1);
  await aspetta(0.4);
  const proiettore = await chiedi(finestre.uscita, `[document.getElementById('scritta').hidden, document.getElementById('scritta').textContent].join('|')`);
  controlla('accesa nei testi per il pubblico: compare (es. «UNO · VOLUME 0.99»)', /^false\|.*VOLUME/.test(proiettore), JSON.stringify(proiettore));
  await js(`window.cutx.salvaPreferenze({ testiPubblico: {} })`);
  await js('cutxProva.fermaTutto()');
  return ok;
}

// --- la cuffia nel CUE: il tasto «cuffia» di ogni sezione si illumina, la striscia «in cuffia» con ■ e STOP (npx electron . --prova=cuffia) ---
async function provaCuffia({ finestre, scrivi }) {
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}${!vero && dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  const js = (codice) => chiedi(finestre.controllo, codice);
  const cuffiaStato = () => chiedi(finestre.cuffia, 'globalThis.cutxStato?.()');
  const brano = '// @brano notte\n// @bpm 120\nsetcpm(120/4)\n// @sezione drum\ns("sine*2").gain(.0001)\n// @sezione basso\ns("sine*4").gain(.0001)\n';
  await js(`cutxProva.fermaTutto(); cutxProva.cue.apriModello('notte.cutx', ${JSON.stringify(brano)}); cutxProva.cue.cambiaModo('brano')`);
  await aspetta(1.5);
  const alto = await js(`document.querySelector('.colonna.cue > .testa').offsetHeight`);
  controlla('la testa del CUE sta su una riga (il tasto «scratch» non va a capo)', alto <= 64, String(alto));
  controlla('i due modi del CUE sono «brano» e «scratch»', (await js(`[document.getElementById('modo-brano'), document.getElementById('modo-libero')].map((b) => b.textContent.trim().split(' ')[0]).join('|')`)) === 'brano|scratch');
  controlla('niente in cuffia: la striscia lo dice e STOP è spento', (await js(`document.getElementById('striscia-voci').textContent`)).includes('niente in cuffia') && (await js(`document.getElementById('cuffia-stop').disabled`)) === true);
  const tastoCuffia = (n) => `[...document.querySelectorAll('#carte .card.sezione')][${n}].querySelectorAll('.card-testa button')`;
  const trovaCuffia = (n) => `[...${tastoCuffia(n)}].find((b) => b.textContent.trim().startsWith('cuffia'))`;
  await js(`${trovaCuffia(1)}.click()`);
  await aspetta(2);
  controlla('il tasto «cuffia» della sezione si illumina', (await js(`${trovaCuffia(1)}.classList.contains('on')`)) === true);
  controlla('e solo il suo', (await js(`${trovaCuffia(2)}.classList.contains('on')`)) === false);
  controlla('la striscia mostra cosa senti, col suo ■', (await js(`document.getElementById('striscia-voci').textContent`)).includes('drum') && (await js(`document.querySelectorAll('#striscia-voci .stop-voce').length`)) === 1);
  controlla('la cuffia suona', !!(await cuffiaStato())?.codice);
  try {
    const cartella = path.join(os.homedir(), 'Desktop', 'cutx-schermate', 'cuffia');
    await mkdir(cartella, { recursive: true });
    await writeFile(path.join(cartella, 'reale.png'), (await finestre.controllo.webContents.capturePage()).toPNG());
  } catch {}
  await js(`${trovaCuffia(1)}.click()`);
  await aspetta(1.2);
  controlla('un secondo clic sul tasto acceso spegne la cuffia', !(await cuffiaStato())?.codice && (await js(`${trovaCuffia(1)}.classList.contains('on')`)) === false);
  await js(`${trovaCuffia(2)}.click()`);
  await aspetta(2);
  await js(`document.querySelector('#striscia-voci .stop-voce').click()`);
  await aspetta(1.2);
  controlla('il ■ della voce la ferma', !(await cuffiaStato())?.codice && (await js(`document.getElementById('striscia-voci').textContent`)).includes('niente'));
  await js(`${trovaCuffia(1)}.click()`);
  await aspetta(2);
  await js(`document.getElementById('cuffia-stop').click()`);
  await aspetta(1.2);
  controlla('STOP spegne tutta la cuffia, la pausa ⇧⌘K resta', !(await cuffiaStato())?.codice && (await js(`!!document.getElementById('cuffia-pausa')`)) === true);
  await js('cutxProva.fermaTutto()');
  return ok;
}

// --- la proposta grafica della striscia «in cuffia» (solo uno screenshot, niente funziona: npx electron . --prova=cuffia-aspetto) ---
async function provaCuffiaAspetto({ finestre, scrivi }) {
  const js = (codice) => chiedi(finestre.controllo, codice);
  const brano = '// @brano notte\n// @bpm 140\nsetcpm(140/4)\n// @sezione drum\ns("bd*4, hh*8").bank("RolandTR909")\n// @sezione basso\nnote("c1 c1 eb1 g1").s("sawtooth").lpf(500)\n// @sezione melodia\nnote("c3 e3 g3 b3").s("triangle")\n';
  await js(`cutxProva.cue.apriModello('notte.cutx', ${JSON.stringify(brano)}); cutxProva.cue.cambiaModo('brano')`);
  await aspetta(1.5);
  await js(`(() => {
    const cuffia = '<svg class="icona-cuffia" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.2" fill="currentColor"/><rect x="17" y="14" width="4" height="6" rx="1.2" fill="currentColor"/></svg>';
    const stile = document.createElement('style');
    stile.textContent = \`
      .striscia-cuffia { display:flex; align-items:center; gap:14px; padding:8px 12px; border-bottom:1px solid var(--linea); background:#0a0d05; font-family:var(--mono); font-size:12px; }
      .striscia-cuffia .titolo-s { color:var(--marcio); letter-spacing:.14em; text-transform:uppercase; font-size:11px; }
      .striscia-cuffia .voce { display:flex; align-items:center; gap:8px; color:var(--testo); }
      .striscia-cuffia .voce button { width:18px; height:18px; padding:0; border:1px solid var(--marcio); background:transparent; color:var(--marcio); font-size:9px; line-height:1; cursor:pointer; }
      .striscia-cuffia .voce button::before { content:''; display:block; width:8px; height:8px; margin:auto; background:var(--marcio); }
      .striscia-cuffia .voce em { font-style:normal; color:var(--secondario); }
      .striscia-cuffia .vuota { color:var(--secondario); }
      .striscia-cuffia .zitta { margin-left:auto; height:34px; padding:0 22px; font-size:13px; letter-spacing:.12em; text-transform:uppercase; font-weight:700; background:var(--marcio); color:#0b0f03; border:0; border-radius:3px; cursor:pointer; }
      .icona-cuffia-b { border:0; background:transparent; color:var(--grigio, #5a5e52); padding:2px 4px; cursor:pointer; display:flex; }
      .icona-cuffia-b.on { color:var(--marcio); filter:drop-shadow(0 0 4px rgba(159,194,58,.6)); }
    \`;
    document.head.append(stile);
    const testa = document.querySelector('.colonna.cue > .testa');
    const striscia = document.createElement('div');
    striscia.className = 'striscia-cuffia';
    striscia.innerHTML = '<span class="titolo-s">in cuffia</span>'
      + '<span class="voce"><button title="ferma questa"></button>2 basso <em>· notte</em></span>'
      + '<span class="voce"><button title="ferma questa"></button>prova libera <em>· scratch</em></span>'
      + '<button class="zitta">zitta</button>';
    testa.after(striscia);
    const teste = [...document.querySelectorAll('#carte .card.sezione .card-testa')];
    teste.forEach((t, k) => {
      const b = document.createElement('button');
      b.className = 'icona-cuffia-b' + (k === 1 ? ' on' : '');
      b.title = k === 1 ? 'in cuffia: clic per fermarla' : 'manda in cuffia';
      b.innerHTML = cuffia;
      t.append(b);
    });
  })()`);
  await aspetta(0.8);
  const cartella = path.join(os.homedir(), 'Desktop', 'cutx-schermate', 'cuffia');
  await mkdir(cartella, { recursive: true });
  await writeFile(path.join(cartella, 'proposta.png'), (await finestre.controllo.webContents.capturePage()).toPNG());
  scrivi(`OK    foto in ${cartella}/proposta.png`);
  return true;
}

// --- testi per il pubblico: cosa si vede sul proiettore e nell'anteprima delle impostazioni (npx electron . --prova=testi) ---
async function provaTesti({ finestre, scrivi }) {
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}${!vero && dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  const js = (codice) => chiedi(finestre.controllo, codice);
  const uscita = (codice) => chiedi(finestre.uscita, codice);
  const prefs = async (testiPubblico, altro = {}) => {
    await js(`window.cutx.salvaPreferenze(${JSON.stringify({ testiPubblico, ...altro })})`);
    await aspetta(0.6);
  };
  if (!(await js('window.cutx.uscitaAperta()'))) await js('window.cutx.uscitaOnOff()');
  for (let i = 0; i < 40 && !finestre.uscita; i++) await aspetta(0.25);
  await aspetta(1.5);
  finestre.uscita.setContentSize(1280, 720);
  await prefs({}, { insegna: true });
  await js(`cutxProva.fermaTutto(); cutxProva.valuta('live', 's("sine*2").gain(.0001)'); cutxProva.motori.live.manda({ tipo: 'tempo', bpm: 120 })`);
  await aspetta(1);
  const pre = '// brano di prova\nsetcpm(120/4)\n\n';
  const codice = `${pre}// la cassa\ns("sine*2").gain(.0001) // piano piano`;
  const entra = (nome, extra = {}) => js(`cutxProva.motori.live.richiesta(${JSON.stringify({ tipo: 'entra', codice, inizio: pre.length, nome, provenienza: 'prova', cicli: 1, scritto: true, ...extra })})`);
  await entra('basso');
  await aspetta(2.5);
  const testo = async () => (await uscita('globalThis.cutxUscita().testo')) ?? '';
  const t0 = await testo();
  controlla('predefiniti: il codice c\'è, commenti e preambolo no', /s\("sine\*2"\)/.test(t0) && !/\/\//.test(t0) && !/setcpm|brano di prova/.test(t0), JSON.stringify(t0));
  controlla('predefiniti: l\'etichetta del livello c\'è', /basso/i.test(t0), JSON.stringify(t0));
  await entra('gesto', { codice: 'setcpm(120/4)\ns("sine*2").gain(.0001)', inizio: 0 });
  await aspetta(2.2);
  controlla('un setcpm scritto dal vivo (nel livello) si vede anche con il preambolo nascosto', /setcpm\(120\/4\)/.test(await testo()) && !/brano di prova/.test(await testo()), JSON.stringify(await testo()));
  await prefs({ commenti: { acceso: true }, preambolo: { acceso: true } });
  const t1 = await testo();
  controlla('commenti e preambolo accesi: si vedono', /la cassa/.test(t1) && /piano piano/.test(t1) && /setcpm/.test(t1) && /brano di prova/.test(t1), JSON.stringify(t1));
  await prefs({ commenti: { acceso: true } });
  const t2 = await testo();
  controlla('solo commenti accesi: il preambolo del brano resta nascosto (resta solo il setcpm del gesto)', /la cassa/.test(t2) && !/brano di prova/.test(t2) && (t2.match(/setcpm/g) ?? []).length === 1, JSON.stringify(t2));
  await prefs({});
  controlla('BPM: «120 BPM» di default', /120 BPM/.test(await uscita(`document.getElementById('bpm').textContent`)));
  await prefs({ bpm: { testo: 'tempo {bpm}' } });
  controlla('BPM: il testo si cambia con il segnaposto', (await uscita(`document.getElementById('bpm').textContent`)) === 'tempo 120');
  await prefs({ bpm: { acceso: false }, frase: { acceso: false }, logo: { acceso: false } });
  controlla('BPM, frase e logo si spengono', (await uscita(`[document.getElementById('bpm').hidden, document.getElementById('frase').hidden, document.getElementById('wordmark').hidden].join()`)) === 'true,true,true');
  await prefs({ neon: { testo: 'ciao ciao' } });
  controlla('neon: il testo si cambia (e le lettere restano una per una)', (await uscita(`document.getElementById('insegna').textContent`)) === 'ciaociao' || (await uscita(`document.getElementById('insegna').textContent`)) === 'ciao ciao');
  await prefs({}, { insegna: false });
  controlla('neon spento', /none/.test(await uscita(`getComputedStyle(document.getElementById('insegna')).display`)));
  await prefs({}, { insegna: true });

  // etichette: rinominare, nascondere, e il paracadute mai
  await entra('scratch');
  await aspetta(2.2);
  await prefs({ etichette: { nomi: { scratch: 'pezzo' } } });
  const tag = async (nome) => uscita(`[...document.querySelectorAll('.livello')].map((b) => b.hidden || b.querySelector('.tag').hidden ? '' : b.querySelector('.tag').textContent).join('|')`);
  controlla('«scratch» rinominato in «pezzo»', /pezzo/.test(await tag()), await tag());
  await prefs({ etichette: { nomi: { scratch: '' } } });
  controlla('nome vuoto: l\'etichetta di «scratch» non si vede', !/scratch|pezzo/.test(await tag()), await tag());
  await entra('paracadute');
  await aspetta(2.2);
  controlla('«paracadute» non compare mai sul proiettore', !/paracadute/i.test(await tag()) && !/paracadute/i.test(await testo()), await tag());
  await prefs({ etichette: { acceso: false } });
  controlla('etichette spente: nessuna', (await tag()).replace(/\|/g, '') === '', await tag());
  await prefs({});

  // il titolo della finestra
  await prefs({ titolo: { testo: 'Serata' } });
  controlla('titolo della finestra', finestre.uscita.getTitle() === 'Serata', finestre.uscita.getTitle());
  await prefs({});

  // anteprima nelle impostazioni
  await js(`document.getElementById('apri-impostazioni').click()`);
  await aspetta(0.5);
  await js(`document.querySelector('#imp-nav [data-sez="proiezione"]').click()`);
  await aspetta(3);
  const doc = `document.querySelector('#imp-anteprima iframe').contentDocument`;
  const livelliAnteprima = await js(`${doc}.querySelectorAll('.livello').length`);
  controlla('anteprima: la vera pagina del proiettore con i livelli di esempio', livelliAnteprima >= 3, String(livelliAnteprima));
  controlla('anteprima: BPM e testi di esempio', /BPM/.test(await js(`${doc}.getElementById('bpm').textContent`)) && /scratch/i.test(await js(`${doc}.getElementById('scorri').textContent`)));
  await prefs({ bpm: { acceso: false } });
  controlla('anteprima: segue subito le impostazioni', (await js(`${doc}.getElementById('bpm').hidden`)) === true);
  await prefs({ conto: { testo: 'fra {n} {cicli}' } });
  await aspetta(1);
  controlla('anteprima: il conto alla rovescia col mio testo', /fra \d cicl[oi]/.test(await js(`${doc}.getElementById('scorri').textContent`)), await js(`${doc}.getElementById('scorri').textContent`));
  const righeTesti = await js(`document.querySelectorAll('#imp-testi .imp-riga').length`);
  controlla('impostazioni: una riga per ogni voce (e avvisi/errori «mai»)', righeTesti === 15, String(righeTesti));
  await js(`document.querySelector('#imp-testi [data-voce="bpm"] button.piccolo').click()`);
  await aspetta(0.8);
  controlla('ripristina riporta la voce al predefinito', (await js(`window.cutx.preferenze().then((p) => JSON.stringify(p.testiPubblico?.bpm ?? null))`)) === 'null');
  // una foto del pannello, per guardarlo a occhio
  try {
    await prefs({});
    await aspetta(4);
    const cartella = path.join(os.homedir(), 'Desktop', 'cutx-schermate', 'testi');
    await mkdir(cartella, { recursive: true });
    await writeFile(path.join(cartella, 'proiezione.png'), (await finestre.controllo.webContents.capturePage()).toPNG());
    await js(`document.getElementById('imp-scrittura').scrollIntoView()`);
    await aspetta(0.5);
    await writeFile(path.join(cartella, 'scrittura.png'), (await finestre.controllo.webContents.capturePage()).toPNG());
  } catch (e) {
    scrivi(`foto non riuscita: ${e.message}`);
  }
  await js(`document.getElementById('chiudi-impostazioni').click()`);
  await prefs({}, { insegna: true });
  await js('cutxProva.fermaTutto()');
  return ok;
}

// --- la finestra del pubblico: mai da sola, si apre e si chiude solo col tasto «uscita» o ⌃⌘F (npx electron . --prova=finestra) ---
async function provaFinestra({ finestre, scrivi }) {
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}${!vero && dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  const js = (codice) => chiedi(finestre.controllo, codice);
  const aperta = () => js('window.cutx.uscitaAperta()');
  const bottone = () => js(`(() => { const b = document.getElementById('uscita-onoff'); return { testo: b.querySelector('i').textContent, acceso: b.classList.contains('on') }; })()`);
  const premi = async (tasto, ...modificatori) => {
    const wc = finestre.controllo.webContents;
    wc.sendInputEvent({ type: 'keyDown', keyCode: tasto, modifiers: modificatori });
    wc.sendInputEvent({ type: 'keyUp', keyCode: tasto, modifiers: modificatori });
    await aspetta(1.5);
  };
  controlla('all\'avvio l\'uscita non è aperta', (await aperta()) === false && !finestre.uscita);
  const preferenze = await js('window.cutx.preferenze()');
  controlla('«apri all\'avvio» è spento di default', preferenze.uscitaApriAvvio === false, JSON.stringify(preferenze.uscitaApriAvvio));
  const chiuso = await bottone();
  controlla('il tasto dice «chiusa» e non è acceso', chiuso.testo === 'chiusa' && !chiuso.acceso, JSON.stringify(chiuso));
  await js('document.getElementById("uscita-onoff").click()');
  await aspetta(1.5);
  const aperto = await bottone();
  controlla('col tasto «uscita» si apre, e il tasto dice «aperta» ed è acceso', (await aperta()) === true && aperto.testo === 'aperta' && aperto.acceso, JSON.stringify(aperto));
  await premi('F', 'control', 'meta');
  controlla('⌃⌘F la chiude', (await aperta()) === false && (await bottone()).testo === 'chiusa');
  await premi('F', 'control', 'meta');
  controlla('⌃⌘F la riapre', (await aperta()) === true && (await bottone()).testo === 'aperta');
  await js('document.getElementById("uscita-onoff").click()');
  await aspetta(1);
  controlla('e il tasto la chiude', (await aperta()) === false && (await bottone()).testo === 'chiusa');
  return ok;
}

// --- la coda: righe sotto il codice, girate a raffica senza perdere né raddoppiare eventi (npx electron . --prova=coda) ---
async function provaCoda({ finestre, scrivi }) {
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}${!vero && dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  const js = (codice) => chiedi(finestre.controllo, codice);
  const CODA_CARTA = `[...document.querySelectorAll('#livelli .card.livello')].filter((c) => c.querySelector('.nome').textContent === 'cima').at(-1) && [...[...document.querySelectorAll('#livelli .card.livello')].filter((c) => c.querySelector('.nome').textContent === 'cima').at(-1).querySelectorAll('.coda-testo')].map((x) => x.textContent).join('\\n')`;
  const live = () => chiedi(finestre.live, 'globalThis.cutxStato?.()');
  const coda = (id, m) => js(`cutxProva.motori.live.manda(${JSON.stringify({ tipo: 'coda', livello: id, ...m })})`);
  const attivo = async () => (await live()).livelli.filter((l) => l.a === null).at(-1);
  if (!(await js('window.cutx.uscitaAperta()'))) await js('window.cutx.uscitaOnOff()');
  for (let i = 0; i < 40 && !finestre.uscita; i++) await aspetta(0.25);
  await aspetta(1.5);

  await js(`cutxProva.fermaTutto(); cutxProva.valuta('live', 'setcpm(240/4)\\ns("sine*2").gain(.0001)')`);
  await aspetta(1.5);
  const r = await js(`cutxProva.motori.live.richiesta(${JSON.stringify({ tipo: 'entra', codice: 's("sine*16").gain(.0001).lpf(800)', nome: 'cima', provenienza: 'prova', cicli: 1 })})`);
  await aspetta(2.5);
  const id = r.livello;
  controlla('il livello suona col suo .lpf(800)', (await attivo())?.id === id);

  // 1. una coda messa a mano sovrascrive il valore scritto nel codice (l'ultimo vince)
  await chiedi(finestre.live, 'cutxRegistro(true)');
  await coda(id, { imposta: ['.lpf(1200)'] });
  await aspetta(1.2);
  let ev = (await chiedi(finestre.live, 'cutxRegistro(false)')).filter((e) => e[0] === id);
  controlla('.lpf(1200) in coda vince su .lpf(800) del codice', ev.length > 10 && ev.at(-1)[2] === 1200, JSON.stringify(ev.slice(-2)));
  const dopo = await attivo();
  controlla('la coda è nello stato del livello, il codice è rimasto com\'è', dopo.coda?.[0] === '.lpf(1200)' && dopo.codice === 's("sine*16").gain(.0001).lpf(800)');

  // 2. una manopola girata a raffica (un messaggio ogni 8 ms per 4 s): niente eventi persi né doppi, rifacimenti limitati
  const tardiPrima = (await live()).tardi;
  const rifattePrima = (await live()).ricostruzioni;
  await chiedi(finestre.live, 'cutxRegistro(true)');
  const t0 = Date.now();
  await js(`globalThis.giroFinito = false; (async () => {
    for (let i = 0; i < 500; i++) {
      cutxProva.motori.live.manda({ tipo: 'coda', livello: ${id}, imposta: ['.lpf(' + (1000 + i) + ')'] });
      await new Promise((r) => setTimeout(r, 8));
    }
    globalThis.giroFinito = true;
  })() && 0`);
  await aspettaChe(() => js('globalThis.giroFinito'), 15);
  const durata = (Date.now() - t0) / 1000;
  await aspetta(0.6);
  ev = (await chiedi(finestre.live, 'cutxRegistro(false)')).filter((e) => e[0] === id);
  const indici = ev.map((e) => Math.round(e[1] * 16));
  const conta = new Map();
  for (const i of indici) conta.set(i, (conta.get(i) ?? 0) + 1);
  const minimo = Math.min(...indici);
  const massimo = Math.max(...indici);
  const mancano = [];
  for (let i = minimo; i <= massimo; i++) if (!conta.has(i)) mancano.push(i);
  const doppi = [...conta].filter(([, n]) => n > 1).map(([i]) => i);
  const dopoGiro = await live();
  const rifatte = dopoGiro.ricostruzioni - rifattePrima;
  controlla(`${ev.length} eventi in ${durata.toFixed(1)} s di manopola: nessuno perso`, ev.length > 50 && mancano.length === 0, `mancano ${mancano.slice(0, 8)}`);
  controlla('nessuno doppio', doppi.length === 0, `doppi ${doppi.slice(0, 8)}`);
  const finestraS = durata + 0.6;
  controlla(`il pattern si rifà al massimo 25 volte al secondo (${rifatte} in ${finestraS.toFixed(1)} s)`, rifatte > 10 && rifatte <= finestraS * 25 + 2, String(rifatte));
  controlla('nessun evento in ritardo', dopoGiro.tardi === tardiPrima, `${dopoGiro.tardi - tardiPrima} tardi`);
  const valori = ev.map((e) => e[2]);
  controlla('i valori salgono mentre giro e finiscono sull\'ultimo (1499)', valori.every((v, k) => k === 0 || v >= valori[k - 1]) && valori.at(-1) === 1499, JSON.stringify(valori.slice(-3)));

  // 3. card e proiettore mostrano la coda, sul posto
  const card = await js(CODA_CARTA);
  controlla('la card mostra la coda', card === '.lpf(1499)', JSON.stringify(card));
  const proiettore = await chiedi(finestre.uscita, `[...document.querySelectorAll('.livello')].filter((b) => /cima/.test(b.querySelector('.tag').textContent)).at(-1)?.querySelector('.coda')?.textContent`);
  controlla('il proiettore mostra la coda', proiettore === '.lpf(1499)', String(proiettore));
  await js(`cutxProva.motori.live.manda({ tipo: 'livello', livello: ${id}, volume: 0.6 })`);
  await aspetta(0.5);
  const conVolume = await js(CODA_CARTA);
  controlla('il volume è l\'ultima riga della coda (.gain(0.6))', conVolume === '.lpf(1499)\n.gain(0.6)', JSON.stringify(conVolume));

  // 4. una riga sbagliata non ferma niente: continua la versione di prima
  await chiedi(finestre.live, 'cutxRegistro(true)');
  await coda(id, { imposta: ['.nonEsisteQuesto(1)'] });
  await aspetta(1);
  ev = (await chiedi(finestre.live, 'cutxRegistro(false)')).filter((e) => e[0] === id);
  const sbagliato = await attivo();
  controlla('una funzione che non esiste: segnalata, e suona la versione di prima', !!sbagliato.codaErrore && ev.length > 8 && ev.every((e) => e[2] === 1499), String(sbagliato.codaErrore));
  await coda(id, { togli: ['nonEsisteQuesto'] });
  await aspetta(0.3);
  controlla('tolta la riga sbagliata l\'errore sparisce', !(await attivo()).codaErrore);

  // 5. pulisci coda (e ⌘Z la rimette)
  await js(`cutxProva.pulisciCoda(${id})`);
  await aspetta(0.5);
  controlla('pulisci coda: la coda è vuota, il codice suona com\'era (.lpf(800))', (await attivo()).coda.length === 0);
  await chiedi(finestre.live, 'cutxRegistro(true)');
  await aspetta(0.8);
  ev = (await chiedi(finestre.live, 'cutxRegistro(false)')).filter((e) => e[0] === id);
  controlla('senza coda torna il valore del codice', ev.length > 4 && ev.at(-1)[2] === 800, JSON.stringify(ev.slice(-1)));
  await js(`cutxProva.annullaSet()`);
  await aspetta(0.5);
  controlla('⌘Z rimette la coda', (await attivo()).coda?.[0] === '.lpf(1499)', JSON.stringify((await attivo()).coda));

  // 6. una modifica al codice del livello non butta via la coda
  await js(`cutxProva.motori.live.richiesta(${JSON.stringify({ tipo: 'entra', codice: 's("sine*8").gain(.0001).lpf(800)', nome: 'cima', provenienza: 'prova', cicli: 1, scritto: true })})`);
  await aspetta(2.5);
  const nuovo = await attivo();
  controlla('applicare una modifica tiene la coda', nuovo.id !== id && nuovo.coda?.[0] === '.lpf(1499)' && nuovo.codice.includes('sine*8'), JSON.stringify({ coda: nuovo.coda, codice: nuovo.codice }));

  // 7. la coda scritta in fondo a una sezione (// @coda) entra col livello
  await js(`cutxProva.fermaTutto()`);
  await aspetta(0.8);
  await js(`cutxProva.scriviCue('s("sine*4").gain(.0001)\\n// @coda\\n.lpf(900)\\n.fast(2)')`);
  await js(`cutxProva.goLive()`);
  await aspetta(2.5);
  const dalFile = await attivo();
  controlla('go live: la coda del file va al livello, il codice è senza', dalFile?.coda?.join('|') === '.lpf(900)|.fast(2)' && !dalFile.codice.includes('@coda'), JSON.stringify({ coda: dalFile?.coda, codice: dalFile?.codice }));

  // 8. il CUE libero, lo stesso caso di chi suona: il codice sopra la coda resta e suona (prima arrivava solo la coda)
  await js(`cutxProva.fermaTutto()`);
  await aspetta(0.8);
  const testoLibero = 'note("c3 e3 g3 b3").s("triangle").gain(.0001)\n// @coda\n.fast(2)\n.lpf(600)';
  await js(`cutxProva.scriviCue(${JSON.stringify(testoLibero)})`);
  await js(`cutxProva.goLive()`);
  await aspetta(2.5);
  const libero = await attivo();
  controlla('CUE libero: il livello ha il suo codice e la sua coda', libero?.codice === 'note("c3 e3 g3 b3").s("triangle").gain(.0001)' && libero.coda?.join('|') === '.fast(2)|.lpf(600)', JSON.stringify({ coda: libero?.coda, codice: libero?.codice }));
  await chiedi(finestre.live, 'cutxRegistro(true)');
  await aspetta(2);
  const suonati = (await chiedi(finestre.live, 'cutxRegistro(false)')).filter((e) => e[0] === libero?.id);
  controlla('CUE libero: suona (con .fast(2) e .lpf(600))', suonati.length >= 8 && suonati.every((e) => e[2] === 600), String(suonati.length));
  const cartaLibera = await js(`[...document.querySelectorAll('#livelli .card.livello')].at(-1)?.querySelector('.codice')?.textContent`);
  controlla('CUE libero: la card mostra il codice', /note\("c3 e3 g3 b3"\)/.test(cartaLibera ?? ''), JSON.stringify(cartaLibera));

  // 9. a) la card LIVE: codice + // @coda + righe, applico: la coda si applica (prima suonavano solo le note)
  const vivo = await attivo();
  const nLivelli = async () => (await live()).livelli.filter((l) => l.a === null).length;
  const errA = await js(`cutxProva.pila.azioni.applica(${JSON.stringify({ id: vivo.id, nome: vivo.nome, provenienza: vivo.provenienza })}, 'note("c3 e3 g3 b3").s("triangle").gain(.0001)\\n// @coda\\n.lpf(300)')`);
  await aspetta(2.5);
  const daCard = await attivo();
  controlla('card LIVE: codice + // @coda + righe, la coda si applica', errA === null && daCard.coda?.join('|') === '.lpf(300)' && !daCard.codice.includes('@coda'), JSON.stringify({ errA, coda: daCard.coda, codice: daCard.codice }));
  await chiedi(finestre.live, 'cutxRegistro(true)');
  await aspetta(1.5);
  const cardEv = (await chiedi(finestre.live, 'cutxRegistro(false)')).filter((e) => e[0] === daCard.id);
  controlla('card LIVE: le note suonano col filtro della coda', cardEv.length > 4 && cardEv.every((e) => e[2] === 300), JSON.stringify(cardEv.slice(-2)));

  // 9. b) una coda da sola non crea né sostituisce un livello: va a quello scelto
  const prima = await nLivelli();
  await js(`cutxProva.pila.selezionato = null`);
  await js(`cutxProva.scriviCue('.lpf(700)')`);
  await js(`cutxProva.goLive()`);
  await aspetta(1);
  const senza = await attivo();
  controlla('coda sola dal CUE, nessun livello scelto: avviso e non cambia niente', (await nLivelli()) === prima && senza.coda?.join('|') === '.lpf(300)' && /nessun livello scelto/.test(await js(`document.getElementById('cue-avviso').textContent`)));
  await js(`cutxProva.pila.seleziona(${daCard.id})`);
  await js(`cutxProva.goLive()`);
  await aspetta(1);
  const scelto = await attivo();
  controlla('coda sola dal CUE, livello scelto: si aggiunge alla sua coda (senza nuovo livello)', (await nLivelli()) === prima && scelto.id === daCard.id && scelto.coda?.join('|') === '.lpf(700)', JSON.stringify({ n: await nLivelli(), coda: scelto.coda }));
  await js(`cutxProva.scriviCue('// @coda\\n.delay(.5)\\n.fast(2)')`);
  await js(`cutxProva.goLive()`);
  await aspetta(1);
  controlla('anche con // @coda e più righe', (await attivo()).coda?.join('|') === '.lpf(700)|.delay(.5)|.fast(2)' && (await nLivelli()) === prima);
  const errJam = await js(`cutxProva.pila.azioni.applica(null, '.room(.3)')`);
  await aspetta(1);
  const dopoJam = await live();
  controlla('jam con una coda sola: non crea un livello muto, va al livello scelto', errJam === null && (await nLivelli()) === prima && !dopoJam.livelli.some((l) => l.nome === 'jam') && (await attivo()).coda.includes('.room(.3)'), JSON.stringify(errJam));
  await js(`cutxProva.pila.selezionato = null`);
  const errJam2 = await js(`cutxProva.pila.azioni.applica(null, '.room(.9)')`);
  await aspetta(0.5);
  controlla('jam con una coda sola e nessun livello scelto: non crea niente e lo dice', typeof errJam2 === 'string' && (await nLivelli()) === prima && !(await live()).livelli.some((l) => l.nome === 'jam'), JSON.stringify(errJam2));

  // 10. un campione che non c'è nello stash (bd, sd): avviso chiaro, non silenzio
  await js(`cutxProva.fermaTutto()`);
  await aspetta(0.5);
  await js(`cutxProva.scriviCue('s("bd sd").gain(.0001)')`);
  await js(`cutxProva.goLive()`);
  await aspetta(1.5);
  const avvisoSuoni = await js(`document.getElementById('cue-avviso').textContent`);
  controlla('suono che non esiste: avviso con i nomi', /bd, sd/.test(avvisoSuoni) && /nello stash/.test(avvisoSuoni), JSON.stringify(avvisoSuoni));

  // 10b. dal CUE libero ogni go live AGGIUNGE un livello (libero, libero 2…); sostituisce solo la modifica della card
  await js(`cutxProva.fermaTutto()`);
  await aspetta(0.8);
  await js(`cutxProva.scriviCue('s("sine*4").gain(.0001)')`);
  await js(`cutxProva.goLive()`);
  await aspetta(2.5);
  await js(`cutxProva.scriviCue('s("sine*2").gain(.0001)')`);
  await js(`cutxProva.goLive()`);
  await aspetta(2.5);
  const nomiLibero = (await live()).livelli.filter((l) => l.a === null).map((l) => l.nome);
  controlla('dal CUE libero il secondo go live aggiunge un livello (scratch, scratch 2)', nomiLibero.join('|') === 'scratch|scratch 2', JSON.stringify(nomiLibero));
  await js(`cutxProva.scriviCue('s("sine*8").gain(.0001)')`);
  await js(`cutxProva.goLive()`);
  await aspetta(2.5);
  controlla('e il terzo (scratch 3)', (await live()).livelli.filter((l) => l.a === null).map((l) => l.nome).join('|') === 'scratch|scratch 2|scratch 3');

  // 11. una funzione già in coda si aggiorna (una riga sola); togliere una sola riga; ⌘Z la rimette
  await js(`cutxProva.fermaTutto()`);
  await aspetta(0.8);
  const unico = await js(`cutxProva.motori.live.richiesta(${JSON.stringify({ tipo: 'entra', codice: 's("sine*4").gain(.0001)', nome: 'cima', provenienza: 'prova', cicli: 1, coda: ['.lpf(600)', '.delay(.4)'] })})`);
  await aspetta(2.5);
  await coda(unico.livello, { imposta: ['.lpf(900)'] });
  await aspetta(0.4);
  controlla('una riga con una funzione già in coda la aggiorna (non ne aggiunge un\'altra)', (await attivo()).coda?.join('|') === '.lpf(900)|.delay(.4)', JSON.stringify((await attivo()).coda));
  await js(`cutxProva.togliRigaCoda(${unico.livello}, 'lpf')`);
  await aspetta(0.4);
  controlla('togliere una sola riga: l\'altra resta', (await attivo()).coda?.join('|') === '.delay(.4)', JSON.stringify((await attivo()).coda));
  await js(`cutxProva.annullaSet()`);
  await aspetta(0.5);
  controlla('⌘Z rimette la riga tolta', (await attivo()).coda?.join('|') === '.lpf(900)|.delay(.4)', JSON.stringify((await attivo()).coda));
  const righeCarta = await js(`document.querySelectorAll('#livelli .card.livello:not(.in-uscita) .coda-x').length`);
  controlla('ogni riga della coda ha la sua ×', righeCarta === 2, String(righeCarta));

  // 13. effetti morbidi: un numero scritto a mano scivola, dalla manopola segue subito; un effetto ritmico entra sul battito, senza sovrapporsi
  await js(`cutxProva.fermaTutto()`);
  await aspetta(0.8);
  const morbido = await js(`cutxProva.motori.live.richiesta(${JSON.stringify({ tipo: 'entra', codice: 's("sine*16").gain(.0001)', nome: 'cima', provenienza: 'prova', cicli: 1, coda: ['.lpf(600)'] })})`);
  await aspetta(2.5);
  const cicloLive = async () => (await live()).ciclo;
  const leggi = async (s) => {
    await chiedi(finestre.live, 'cutxRegistro(true)');
    await aspetta(s);
    return (await chiedi(finestre.live, 'cutxRegistro(false)')).filter((e) => e[0] === morbido.livello);
  };
  await chiedi(finestre.live, 'cutxRegistro(true)');
  await coda(morbido.livello, { imposta: ['.lpf(1000)'], origine: 'mano', scivolata: 1 });
  await aspetta(2.2);
  let ev2 = (await chiedi(finestre.live, 'cutxRegistro(false)')).filter((e) => e[0] === morbido.livello);
  const valoriMano = ev2.map((e) => e[2]);
  const distinti = [...new Set(valoriMano)];
  controlla('a mano: il numero scivola da 600 a 1000 (valori intermedi, mai indietro)', distinti.length >= 5 && valoriMano.every((v, k) => k === 0 || v >= valoriMano[k - 1]) && valoriMano[0] <= 700 && valoriMano.at(-1) === 1000, JSON.stringify(distinti.slice(0, 12)));
  const stato = await attivo();
  controlla('la scivolata finisce e il pattern torna a un numero fisso', Object.keys(stato.scivola ?? {}).length === 0 || (await aspetta(1), Object.keys((await attivo()).scivola ?? {}).length === 0));
  await chiedi(finestre.live, 'cutxRegistro(true)');
  await coda(morbido.livello, { imposta: ['.lpf(1400)'] }); // dalla manopola: niente scivolata
  const ev3 = await leggi(0.9);
  controlla('dalla manopola il numero segue subito la mano (nessun valore intermedio)', ev3.length > 5 && ev3.every((e) => e[2] === 1400), JSON.stringify([...new Set(ev3.map((e) => e[2]))]));
  // effetto ritmico: .fast(2) raddoppia gli eventi esattamente da un battito (¼ di ciclo)
  await chiedi(finestre.live, 'cutxRegistro(true)');
  await coda(morbido.livello, { imposta: ['.fast(2)'], origine: 'mano', scivolata: 1 });
  await aspetta(2.2);
  const ev4 = (await chiedi(finestre.live, 'cutxRegistro(false)')).filter((e) => e[0] === morbido.livello);
  const sulla16 = (c) => Math.abs(c * 16 - Math.round(c * 16)) < 1e-6;
  const primoNuovo = ev4.find((e) => !sulla16(e[1]));
  const B = primoNuovo ? Math.floor(primoNuovo[1] * 4) / 4 : null;
  const vecchi = ev4.filter((e) => B !== null && e[1] < B - 1e-9);
  const dopoB = ev4.filter((e) => B !== null && e[1] >= B - 1e-9);
  const duplicati = ev4.length - new Set(ev4.map((e) => e[1].toFixed(6))).size;
  controlla('effetto ritmico: cambia esattamente su un battito, prima solo il vecchio', B !== null && vecchi.every((e) => sulla16(e[1])), JSON.stringify({ B, vecchi: vecchi.length }));
  controlla('effetto ritmico: dal battito solo il nuovo (il doppio degli eventi), nessun evento doppio', dopoB.some((e) => Math.abs(e[1] - B) < 1e-6) && dopoB.length > 8 && duplicati === 0, JSON.stringify({ dopo: dopoB.length, duplicati }));
  void cicloLive;

  // 12. ⌃1–9 sceglie il livello (⌥ resta il muto); esc toglie la scelta
  await js(`cutxProva.motori.live.richiesta(${JSON.stringify({ tipo: 'entra', codice: 's("sine*4").gain(.0001)', nome: 'due', provenienza: 'prova', cicli: 1 })})`);
  await aspetta(2.5);
  const attiviOra = (await live()).livelli.filter((l) => l.a === null);
  const tasto = async (keyCode, modificatori) => {
    const wc = finestre.controllo.webContents;
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers: modificatori });
    wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers: modificatori });
    await aspetta(0.5);
  };
  await js(`cutxProva.pila.selezionato = null`);
  await tasto('2', ['control']);
  controlla('⌃2 sceglie il secondo livello', (await js(`cutxProva.pila.selezionato`)) === attiviOra[1]?.id && (await js(`document.querySelectorAll('#livelli .card.livello.selezionato').length`)) === 1, JSON.stringify([attiviOra.map((l) => l.id), await js(`cutxProva.pila.selezionato`)]));
  await tasto('1', ['control']);
  controlla('⌃1 passa al primo', (await js(`cutxProva.pila.selezionato`)) === attiviOra[0]?.id);
  controlla('⌥ non cambia la scelta (resta il muto)', await (async () => { await tasto('2', ['alt']); return (await js(`cutxProva.pila.selezionato`)) === attiviOra[0]?.id; })());
  await tasto('Escape', []);
  controlla('esc toglie la scelta', (await js(`cutxProva.pila.selezionato`)) === null && (await js(`document.querySelectorAll('#livelli .card.livello.selezionato').length`)) === 0);

  await js('cutxProva.fermaTutto()');
  return ok;
}

// --- pausa della cuffia: si ferma, e alla ripresa è di nuovo allineata al live (npx electron . --prova=pausa) ---
async function provaPausa({ finestre, scrivi }) {
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}${!vero && dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  const js = (codice) => chiedi(finestre.controllo, codice);
  const stato = (ruolo) => chiedi(finestre[ruolo], 'globalThis.cutxStato?.()');
  await js(`cutxProva.fermaTutto(); cutxProva.valuta('live', 'setcpm(120/4)\\ns("sine*2").gain(.0001)')`);
  await aspetta(1.5);
  await js(`cutxProva.valuta('cuffia', 's("sine*4").gain(.01)')`);
  await aspetta(1.5);
  controlla('la cuffia suona e non è in pausa', (await stato('cuffia')).pausa === false && (await stato('cuffia')).contesto === 'running');
  await js('cutxProva.pausaCuffia(true)');
  await aspetta(0.8);
  const ferma = await stato('cuffia');
  controlla('in pausa il contesto della cuffia è sospeso (il live continua)', ferma?.pausa === true && ferma.contesto === 'suspended' && (await stato('live')).contesto === 'running', JSON.stringify({ p: ferma?.pausa, c: ferma?.contesto }));
  await js('document.getElementById("cuffia-pausa").textContent').then((t) => controlla('il pulsante dice «riprendi»', /riprendi/.test(t), t));
  await aspetta(3.5); // la pausa dura: il live va avanti di quasi due cicli
  await js('cutxProva.pausaCuffia(false)');
  await aspetta(1.5);
  const dopo = await stato('cuffia');
  const live = await stato('live');
  const differenza = Math.abs(dopo.ciclo - live.ciclo);
  controlla('alla ripresa suona di nuovo, allineata al tempo del live (meno di 0,15 cicli)', dopo.pausa === false && dopo.contesto === 'running' && differenza < 0.15, JSON.stringify({ cuffia: dopo.ciclo, live: live.ciclo, differenza }));
  controlla('e non ha perso colpi per recuperare (tardi invariato o quasi)', dopo.tardi < 20, String(dopo.tardi));
  // mandare qualcosa in cuffia durante la pausa la riprende
  await js('cutxProva.pausaCuffia(true)');
  await aspetta(0.5);
  await js(`cutxProva.valuta('cuffia', 's("sine*2").gain(.01)')`);
  await aspetta(0.8);
  const ripresa = await stato('cuffia');
  controlla('mandare un codice in cuffia durante la pausa la riprende', ripresa.pausa === false && ripresa.contesto === 'running');
  await js('cutxProva.fermaTutto()');
  return ok;
}


// --- ⌘Z fuori dagli editor: livello tolto, volume, muto, modifica live, brano chiuso; mai il live (npx electron . --prova=annulla) ---
async function provaAnnulla({ finestre, scrivi }) {
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}${!vero && dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  const js = (codice) => chiedi(finestre.controllo, codice);
  const live = () => chiedi(finestre.live, 'globalThis.cutxStato?.()');
  const livello = async (nome) => (await live()).livelli.filter((l) => l.nome === nome).at(-1);
  const entra = (nome, codice) => js(`cutxProva.motori.live.richiesta(${JSON.stringify({ tipo: 'entra', codice, nome, provenienza: 'prova', cicli: 1 })})`);
  const tasto = (modifiers) => {
    const wc = finestre.controllo.webContents;
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Z', modifiers });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Z', modifiers });
  };
  await js(`cutxProva.fermaTutto(); cutxProva.valuta('live', 'setcpm(240/4)\\ns("sine*2").gain(.0001)')`);
  await js(`cutxProva.cue.cambiaModo('libero'); cutxProva.scriviCue('// @sezione base\\ns("sine").gain(.0001)\\n'); document.activeElement?.blur()`);
  await js('cutxProva.cronologia.svuota()');
  await aspetta(1.5);

  // volume: un trascinamento è un passo solo; ⌘Z lo riporta subito, ⇧⌘Z lo rifà
  await entra('basso', 's("sine*2").gain(.02)');
  await aspetta(1.5);
  const id = (await livello('basso')).id;
  await js(`(() => { const a = cutxProva.pila.azioni; a.volumeInizio(${id}); for (const v of [0.8, 0.6, 0.4]) cutxProva.motori.live.manda({ tipo: 'livello', livello: ${id}, volume: v }); })()`);
  await aspetta(0.6);
  await js(`cutxProva.pila.azioni.volumeFine(${id})`);
  controlla('un trascinamento del volume è un passo solo', (await js('cutxProva.cronologia.conta')) === 1);
  tasto(['meta']);
  await aspetta(0.8);
  controlla('⌘Z (la tastiera vera) rimette subito il volume di prima', Math.abs((await livello('basso')).volume - 1) < 0.01, String((await livello('basso')).volume));
  tasto(['shift', 'meta']);
  await aspetta(0.8);
  controlla('⇧⌘Z lo rifà', Math.abs((await livello('basso')).volume - 0.4) < 0.01, String((await livello('basso')).volume));
  tasto(['meta']);
  await aspetta(0.5);

  // muto
  await js(`cutxProva.pila.azioni.muto(${id}, true)`);
  await aspetta(0.6);
  controlla('il muto si annulla subito', (await livello('basso')).muto === true && ((await js('cutxProva.annullaSet()')), await aspetta(0.6), (await livello('basso')).muto === false));

  // modifica live sbagliata: ⌘Z non la cambia, mette la versione di prima nell'editor
  const vecchio = 's("sine*2").gain(.02)';
  const nuovo = 's("sine*8").gain(.02)';
  const livelloUi = await js(`cutxProva.pila.livelli.find((l) => l.nome === 'basso' && l.a === null)`);
  await js(`cutxProva.pila.azioni.applica(${JSON.stringify(livelloUi)}, ${JSON.stringify(nuovo)})`);
  await aspetta(2);
  const dopoModifica = await livello('basso');
  await js('cutxProva.annullaSet()');
  await aspetta(0.6);
  const inEditor = await js(`(() => { const m = cutxProva.pila.modifiche.get('basso'); return m ? m.editor.codice : null; })()`);
  const ancora = await livello('basso');
  controlla('modifica live: ⌘Z mette la versione di prima nell\'editor, senza applicarla', inEditor === vecchio && ancora.codice === dopoModifica.codice && ancora.codice.includes('sine*8'), JSON.stringify({ inEditor, live: ancora.codice }));
  await js(`cutxProva.pila.chiudiModifica('basso')`);

  // livello tolto: torna nel CUE, e il live non riceve niente
  const prima = (await live()).livelli.length;
  const idAttuale = (await livello('basso')).id; // la modifica ha sostituito il livello: ora è un altro
  await js(`cutxProva.togli(${idAttuale})`);
  await aspetta(1.5);
  await js(`cutxProva.motori.live.manda = ((f) => (m) => ((globalThis.__inviati ??= []).push(m.tipo), f(m)))(cutxProva.motori.live.manda.bind(cutxProva.motori.live))`);
  await js('cutxProva.annullaSet()');
  await aspetta(0.6);
  const testoCue = await js('cutxProva.cue.libero.codice');
  const inviati = await js('globalThis.__inviati ?? []');
  controlla('livello tolto: ⌘Z lo riporta nel CUE come sezione', /@sezione basso/.test(testoCue) && testoCue.includes('sine*8'), testoCue);
  controlla('e non manda niente al live (a parte i ping): lo rimanda chi suona', inviati.filter((t) => t !== 'ping').length === 0 && !(await live()).livelli.some((l) => l.nome === 'basso' && l.a === Infinity), JSON.stringify(inviati));

  // brano chiuso: aprirne un altro lo chiude; ⌘Z lo riapre com'era
  await js(`cutxProva.cue.apriModello('uno.cutx', '// @brano uno\\n// @bpm 120\\n// @sezione a\\ns("sine")\\n')`);
  await js(`cutxProva.cue.apriModello('due.cutx', '// @brano due\\n// @bpm 120\\n// @sezione b\\ns("sine")\\n')`);
  await js('cutxProva.annullaSet()');
  await aspetta(0.3);
  controlla('brano chiuso: ⌘Z lo riapre', (await js('cutxProva.cue.brano.file')) === 'uno.cutx');

  // dentro un editor ⌘Z è solo del testo: la cronologia non si muove
  await js('cutxProva.cronologia.svuota()');
  await js(`cutxProva.pila.azioni.muto(${idAttuale}, true)`);
  const conta = await js('cutxProva.cronologia.conta');
  await js('cutxProva.cue.libero.focus()');
  tasto(['meta']);
  await aspetta(0.4);
  controlla('dentro un editor ⌘Z non tocca il set', (await js('cutxProva.cronologia.conta')) === conta);
  await js('cutxProva.fermaTutto()');
  return ok;
}
