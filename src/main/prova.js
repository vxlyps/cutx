// Prova automatica di robustezza (npm run prova). Fa suonare il click di test su live e cuffia,
// poi blocca e crasha interfaccia e cuffia, una cosa alla volta. Per ogni fase conta i click
// che la sentinella del live ha sentito davvero in uscita: le casse non devono perderne uno.
import path from 'node:path';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';

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

export async function prova({ finestre, cartellaLog }) {
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
  await chiedi(finestre.controllo, `cutxProva.avviaTest(${JSON.stringify(CODICE)})`);
  await aspetta(3); // si parte quando la sentinella è accesa e il click gira

  let prima = (await stato('live')).sentinella;
  let tardiPrima = (await stato('live')).tardi;
  let ok = true;

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

export async function foto({ finestre, file }) {
  const pronta = () => chiedi(finestre.controllo, '!!globalThis.cutxProva && !!document.querySelector(".cm-editor")');
  await aspettaChe(async () => (await chiedi(finestre.live, 'globalThis.cutxStato?.()')) && (await pronta()));
  await aspetta(1);
  await chiedi(finestre.controllo, `cutxProva.valuta('live', ${JSON.stringify(FOTO_LIVE)})`);
  await chiedi(finestre.controllo, `cutxProva.scriviCue(${JSON.stringify(FOTO_CUE)})`);
  await chiedi(finestre.controllo, `cutxProva.valuta('cuffia', ${JSON.stringify(FOTO_CUE)})`);
  await chiedi(finestre.controllo, "cutxProva.posaGatto('lecca')"); // così si vede anche l'insegna
  await aspetta(1.5);
  const img = await finestre.controllo.webContents.capturePage();
  await writeFile(file, img.toPNG());
  console.log(`[foto] ${file}`);
  // E le impostazioni, aperte con ⌘,
  const wc = finestre.controllo.webContents;
  wc.sendInputEvent({ type: 'keyDown', keyCode: ',', modifiers: ['meta'] });
  await aspetta(1);
  const altro = file.replace(/\.png$/, '-impostazioni.png');
  await writeFile(altro, (await wc.capturePage()).toPNG());
  console.log(`[foto] ${altro}`);
}
