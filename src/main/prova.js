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

export async function prova({ finestre, cartellaLog, parti = ['robustezza', 'brani', 'entrata', 'livelli', 'browser', 'impostazioni', 'ableton', 'neon'] }) {
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
  const sicura = (nome, fn) => fn({ finestre, scrivi }).catch((e) => (scrivi(`FALLITO ${nome}: ${e.stack ?? e}`), false));
  if (parti.includes('brani')) ok = (await sicura('brani', provaBrani)) && ok;
  if (parti.includes('entrata')) ok = (await sicura('entrata', provaEntrata)) && ok;
  if (parti.includes('livelli')) ok = (await sicura('livelli', provaLivelli)) && ok;
  if (parti.includes('browser')) ok = (await sicura('browser', provaBrowser)) && ok;
  if (parti.includes('impostazioni')) ok = (await sicura('impostazioni', provaImpostazioni)) && ok;
  if (parti.includes('ableton')) ok = (await sicura('ableton', provaAbleton)) && ok;
  if (parti.includes('neon')) ok = (await sicura('neon', provaNeon)) && ok;

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
  controlla('go live da una card manda la sezione col suo nome', live?.nome === 'melodia' && live?.provenienza === `${nome} §2`, JSON.stringify([live?.nome, live?.provenienza]));
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
  await writeFile(path.join(cartellaSuoni, 'a.wav'), 'RIFF');
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

    // un campione suona una volta sola, non a ogni ciclo; un secondo clic lo ferma
    await js(`(() => { const c = document.getElementById('cerca'); c.value = 'cassa'; c.dispatchEvent(new Event('input')); })()`);
    const prima = (await chiedi(finestre.cuffia, 'globalThis.cutxStato?.()')).eventi;
    await js(`document.querySelector('#elenco .voce button[data-aiuto="browser-prova"]').click()`);
    await aspetta(7); // più di tre cicli a 120 BPM
    const dopo = await chiedi(finestre.cuffia, 'globalThis.cutxStato?.()');
    controlla('▶ su un campione lo suona una volta sola', dopo.unaVolta === true && dopo.eventi - prima === 1, `eventi ${dopo.eventi - prima}`);
    controlla('il tasto è ■ finché non lo fermo', (await js(`document.querySelector('#elenco .voce button.on')?.textContent`)) === '■');
    await js(`document.querySelector('#elenco .voce button.on').click()`);
    await aspetta(0.5);
    controlla('un secondo clic lo ferma', !(await chiedi(finestre.cuffia, 'globalThis.cutxStato?.()')).codice);

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
    controlla('l\'elenco ha tutte le azioni', righe === 20, String(righe));
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
    controlla('la proiezione ha i suoi cinque interruttori', interruttori === 5, String(interruttori));
    await js(`document.querySelectorAll('#imp-proiezione .imp-riga')[2].querySelectorAll('button')[1].click()`); // gatto off
    await aspetta(0.5);
    controlla('gatto off: sparisce dalla barra', (await prefs()).gatto === false && (await js(`getComputedStyle(document.querySelector('.barra .gatto-posto')).display`)) === 'none');
    await js(`document.querySelectorAll('#imp-proiezione .imp-riga')[3].querySelectorAll('button')[1].click()`); // insegna off
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
    await js(`window.cutx.salvaPreferenze(${JSON.stringify({ scorciatoie: archiviaPreferenze.scorciatoie ?? {}, suggerimenti: archiviaPreferenze.suggerimenti ?? true, riquadroHelp: archiviaPreferenze.riquadroHelp ?? true, gatto: true, insegna: true, lunghezzaFrase: archiviaPreferenze.lunghezzaFrase })})`);
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
    const cartellaSuono = path.join(stash.radice(), 'suoni', 'tre_01_loop');
    await rm(fileBrano, { force: true });
    await js(`document.getElementById('importa-vai').click()`);
    for (let i = 0; i < 40 && !existsSync(fileBrano); i++) await aspetta(0.25);
    await aspetta(1);
    const scritto = existsSync(fileBrano) ? await readFile(fileBrano, 'utf8') : '';
    controlla('importa scrive il brano nella libreria dello stash', scritto.startsWith('// @brano tre notti') && scritto.includes('// @origine ') && scritto.includes('// @suoni tre_01_loop'), scritto.slice(0, 200));
    controlla('e copia il suono che c\'è nello stash, in una cartella sua', existsSync(path.join(cartellaSuono, 'loop.wav')));
    controlla('il file che manca non si copia (e non rompe niente)', !existsSync(path.join(stash.radice(), 'suoni', 'tre_02_manca')));
    controlla('il pannello si chiude e il brano è aperto nel CUE', (await js(`document.getElementById('importa').hidden`)) && (await js('cutxProva.cue.modo')) === 'brano' && (await js('cutxProva.cue.brano?.file')) === 'tre_notti.cutx');
    controlla('le sezioni ci sono tutte', (await js('cutxProva.cue.brano.modello.sezioni.length')) === 4);
    controlla('il browser mostra il suono nuovo e il brano nella libreria', (await js('Object.keys(cutxProva.suoniStash()).includes("tre_01_loop")')) && (await js('cutxProva.libreria().some((b) => b.file === "tre_notti.cutx")')));
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
      const titolo = `prova ${sigla}`;
      const fileBrano = path.join(radiceStash, 'libreria', `prova_${sigla}.cutx`);
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
        await aspetta(1.5);
        const c = await chiedi(finestre.cuffia, 'globalThis.cutxStato?.()');
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
      for (let i = 0; i < 80 && !existsSync(fileBrano); i++) await aspetta(0.25);
      await aspetta(1.5);
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
      controlla(`${sigla}: il brano è aperto nel CUE in modalità brano`, (await js('cutxProva.cue.modo')) === 'brano' && (await js('cutxProva.cue.brano?.file')) === `prova_${sigla}.cutx`);
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
    if ((s.overflowX === 'hidden' || s.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1 && s.textOverflow !== 'ellipsis' && el.children.length === 0 && testo(el))
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
  await verifiche('postazione', finestre.controllo, 'cutxProva.accendiInsegna', 'cutxProva.spegniLettera');
  // sul proiettore (la finestra di uscita): stesso comportamento
  await js('window.cutx.uscitaOnOff()');
  for (let i = 0; i < 40 && !finestre.uscita; i++) await aspetta(0.25);
  await aspetta(1.5);
  if (finestre.uscita) {
    await verifiche('uscita', finestre.uscita, 'cutxInsegna.sfarfalla', 'cutxInsegna.spegniLettera');
    await js('window.cutx.uscitaOnOff()');
  } else controlla('la finestra di uscita si apre', false);
  // i tempi: tra un flicker e l'altro 8–20 s, una lettera ogni 5–14 s (sono costanti del modulo)
  const sorgente = await readFile(new URL('../renderer/insegna.js', import.meta.url), 'utf8');
  controlla('i tempi sono quelli chiesti: flicker ogni 8–20 s', /FLICKER_MIN_MS = 8_000/.test(sorgente) && /FLICKER_MAX_MS = 20_000/.test(sorgente));
  return ok;
}
