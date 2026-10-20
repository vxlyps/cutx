// Prova automatica di robustezza (npm run prova). Fa suonare il click di test su live e cuffia,
// poi blocca e crasha interfaccia e cuffia, una cosa alla volta. Per ogni fase conta i click
// che la sentinella del live ha sentito davvero in uscita: le casse non devono perderne uno.
import path from 'node:path';
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as stash from './stash.js';

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

export async function prova({ finestre, cartellaLog, parti = ['robustezza', 'brani'] }) {
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
  if (parti.includes('brani')) ok = (await provaBrani({ finestre, scrivi })) && ok;

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
  await chiedi(finestre.controllo, "cutxProva.posaGatto('lecca'); cutxProva.accendiInsegna()"); // così si vede anche l'insegna accesa
  await aspetta(1.5);
  const img = await finestre.controllo.webContents.capturePage();
  await writeFile(fotoFile, img.toPNG());
  console.log(`[foto] ${fotoFile}`);
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

  // E le impostazioni, aperte con ⌘,
  const wc = finestre.controllo.webContents;
  wc.sendInputEvent({ type: 'keyDown', keyCode: ',', modifiers: ['meta'] });
  await aspetta(1);
  const altro = fotoFile.replace(/\.png$/, '-impostazioni.png');
  await writeFile(altro, (await wc.capturePage()).toPNG());
  console.log(`[foto] ${altro}`);
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
