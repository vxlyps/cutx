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

export async function prova({ finestre, cartellaLog, parti = ['robustezza', 'brani', 'entrata', 'livelli'] }) {
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
