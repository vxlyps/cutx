// Prova della CIMICE sul proiettore (la finestra dell'uscita): entra, legge i dati veri, impazzisce sul drop, non ruba clic, non cambia il codice, si spegne.
// Tutto con il master a zero e livelli quasi muti. Foto in ~/Desktop/cutx-schermate/cimice.
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function provaCimice({ finestre, scrivi, chiedi, aspetta }) {
  let ok = true;
  const controlla = (nome, vero, dettagli = '') => {
    scrivi(`${vero ? 'OK   ' : 'FALLITO'} ${nome}${!vero && dettagli ? ` · ${dettagli}` : ''}`);
    ok &&= !!vero;
  };
  const js = (codice) => chiedi(finestre.controllo, codice);
  const u = (codice) => chiedi(finestre.uscita, codice);
  await js(`cutxProva.fermaTutto(); cutxProva.motori.live.manda({ tipo: 'master', volume: 0 })`);
  await aspetta(1);
  if (!(await js('window.cutx.uscitaAperta()'))) await js('window.cutx.uscitaOnOff()');
  for (let i = 0; i < 40 && !finestre.uscita; i++) await aspetta(0.25);
  await aspetta(1.5);
  await js(`cutxProva.valuta('live', 'setcpm(120/4)\ns("sine*2").gain(.0001)')`);
  await aspetta(1);
  const codici = [
    ['colpi', 's("bd*4, ~ sd ~ sd, hh*8").bank("RolandTR909").gain(.0001)'],
    ['basso', 'note("c2 [~ eb2] g1 bb1").s("sawtooth").lpf(380).gain(.0001)'],
    ['arpa', 'note("<c4 eb4 g4 bb4>*8").s("triangle").delay(.3).gain(.0001)'],
  ];
  for (const [nome, codice] of codici) {
    await js(`cutxProva.motori.live.richiesta(${JSON.stringify({ tipo: 'entra', codice, nome, provenienza: 'prova', cicli: 1 })})`);
    await aspetta(1.5);
  }
  await aspetta(4);

  const canvasFissi = `[...document.querySelectorAll('canvas')].filter((x) => x.style.position === 'fixed')`;
  controlla('nell\'interfaccia di lavoro la cimice non c\'è', (await js(`[...document.querySelectorAll('canvas')].filter((x) => x.style.position === 'fixed').length`)) === 0 && (await js('typeof cutxProva.cimice')) === 'undefined');
  controlla('sul proiettore la cimice è accesa di serie', !!(await u('cutxCimice().acceso')));
  controlla('un solo canvas, sopra tutto, che non prende i clic', (await u(`(() => { const c = ${canvasFissi}; return c.length === 1 && getComputedStyle(c[0]).pointerEvents === 'none'; })()`)) === true);
  const lettura = await u('JSON.stringify(cutxCimice().ultima)');
  const l = lettura && lettura !== 'null' ? JSON.parse(lettura) : null;
  controlla('il sensore legge i livelli veri (energia e basso)', !!l && l.energia > 0 && l.basso > 0, lettura);

  // il testo di partenza, per vedere che la cimice non lo tocchi
  const testo = () => u(`[...document.querySelectorAll('#scorri pre.codice')].map((e) => e.textContent).join('|')`);
  const testoLavoro = () => js(`[...document.querySelectorAll('.colonna.cue .cm-content, #colonna-live pre.codice')].map((e) => e.textContent).join('|')`);
  const lavoroPrima = await testoLavoro();
  const prima = await testo();
  await u('cutxCimice().interno.evoca()');
  await aspetta(4);
  controlla('la cimice è entrata', (await u('cutxCimice().interno.presente')) === true);
  const nParole = Number(await u('cutxCimice().interno.parole.length'));
  controlla('conosce le parole del codice (cache)', nParole > 20, `${nParole}`);
  controlla('il testo del codice è identico', (await testo()) === prima);

  // drop: impazzisce
  await u('cutxCimice().interno.battuta({ drop: true })');
  await aspetta(1.2);
  controlla('sul drop impazzisce', (await u('cutxCimice().interno.folle')) === true);
  const cartella = path.join(os.homedir(), 'Desktop', 'cutx-schermate', 'cimice');
  await mkdir(cartella, { recursive: true });
  for (let i = 0; i < 3; i++) {
    await writeFile(path.join(cartella, `cimice-drop-${i}.png`), (await finestre.uscita.webContents.capturePage()).toPNG());
    await aspetta(0.5);
  }
  controlla('il testo è identico anche mentre impazzisce (proiettore e interfaccia)', (await testo()) === prima && (await testoLavoro()) === lavoroPrima);

  // la grandezza moltiplica la scala automatica, e cambia subito
  const scala = (n) => js(`(async () => { const p = await window.cutx.preferenze(); await window.cutx.salvaPreferenze({ cimice: { ...p.cimice, scala: ${n} } }); })()`);
  const k1 = Number(await u('cutxCimice().interno.scalaEffettiva'));
  await scala(2);
  await aspetta(1);
  const k2 = Number(await u('cutxCimice().interno.scalaEffettiva'));
  controlla('la grandezza ×2 raddoppia la scala automatica, subito', k1 > 0 && Math.abs(k2 / k1 - 2) < 0.05, `${k1} → ${k2}`);
  await scala(1);
  await aspetta(1);

  // --- i dispetti: glitch veri, brevi, a tempo, che tornano da soli ---
  const prefD = (o) => js(`(async () => { const p = await window.cutx.preferenze(); await window.cutx.salvaPreferenze({ cimice: { ...p.cimice, ...${JSON.stringify(o)} } }); })()`);
  const spenti = (await js('window.cutx.preferenze().then((p) => !p.cimice.dispetti)')) === true;
  controlla('i dispetti sono spenti di serie', spenti);
  const stato = async () => JSON.parse(await chiedi(finestre.live, 'JSON.stringify(globalThis.cutxStato?.())'));
  const codaDi = async (nome) => (await stato()).livelli?.find((x) => x.nome === nome && x.a === null)?.coda ?? [];
  await prefD({ dispetti: false });
  controlla('spenti: nessun dispetto parte nemmeno se la cimice tocca', (await js(`cutxProva.dispetti().suTocco({ livello: 'basso', ciclo: cutxProva.cicloAdesso(), forza: true })`)) === null);
  await prefD({ dispetti: true, dispettiFrequenza: 'spesso' });
  await aspetta(0.5);
  let piano = null;
  for (let i = 0; i < 6 && !piano; i++) { // la prima volta il pattern si sta ancora valutando
    piano = JSON.parse((await js(`JSON.stringify(cutxProva.dispetti().suTocco({ livello: 'basso', ciclo: cutxProva.cicloAdesso(), forza: true }))`)) ?? 'null');
    if (!piano) await aspetta(0.7);
  }
  controlla('un dispetto parte sul livello toccato', !!piano, `${JSON.stringify(piano)} · motivo: ${await js('cutxProva.dispetti().motivo')} · errore: ${await js('cutxProva.dispetti().errore')}· vede: ${await js('cutxProva.dispetti().vede')} · livelli: ${await js("JSON.stringify(cutxProva.motori.live.stato.livelli?.map((l) => [l.nome, l.a, l.da, !!l.codice, Array.isArray(l.coda)]))")}`);
  if (piano) {
    const riga = piano.righe[0];
    const durataS = (piano.fine - piano.inizio) / 0.5;
    controlla('dura da mezzo secondo a 2 secondi, sulla griglia', durataS >= 0.49 && durataS <= 2.01 && Math.abs(piano.inizio / piano.g - Math.round(piano.inizio / piano.g)) < 1e-6, `${durataS}s g=${piano.g}`);
    let dentro = false;
    for (let i = 0; i < 12 && !dentro; i++) { await aspetta(0.15); dentro = (await codaDi('basso')).includes(riga); }
    controlla('il motore ha la riga nella coda (suona davvero)', dentro, riga);
    controlla('nella card la riga è in ruggine', (await js(`!!document.querySelector('#colonna-live .coda-riga.dispetto')`)) === true);
    controlla('il testo del livello non cambia', (await testoLavoro()) === lavoroPrima);
    let tornato = false;
    for (let i = 0; i < 20 && !tornato; i++) { await aspetta(0.25); tornato = !(await codaDi('basso')).includes(riga); }
    controlla('dopo, da solo, torna com\'era', tornato);
    controlla('e la voce dell\'annulla non resta in cronologia', (await js('cutxProva.dispetti().attivo')) === null);
  }
  // dal proiettore: la cimice tocca e prima o poi parte un dispetto (probabilità, nessun forzatura)
  let visto = false;
  for (let i = 0; i < 40 && !visto; i++) {
    await u(`cutxCimiceTocca('basso')`);
    await aspetta(0.3);
    visto = (await js('cutxProva.dispetti().attivo')) !== null;
  }
  controlla('il tocco dal proiettore arriva all\'interfaccia e, a caso, fa partire un dispetto', visto);
  // lo stop riporta tutto subito
  if (!visto) await js(`cutxProva.dispetti().suTocco({ livello: 'basso', ciclo: cutxProva.cicloAdesso(), forza: true })`);
  const riga2 = JSON.parse((await js('JSON.stringify(cutxProva.dispetti().attivo?.righe ?? null)')) ?? 'null')?.[0];
  await js('cutxProva.dispetti().fermaTutti(cutxProva.cicloAdesso(), "tasto")');
  await aspetta(1);
  controlla('lo stop ferma subito il dispetto e la coda torna vuota', (await js('cutxProva.dispetti().attivo')) === null && (!riga2 || !(await codaDi('basso')).includes(riga2)));
  await prefD({ dispetti: false });

  // spenta: sparisce subito; riaccesa: torna a esserci
  const pref = (acceso) => js(`(async () => { const p = await window.cutx.preferenze(); await window.cutx.salvaPreferenze({ cimice: { ...p.cimice, acceso: ${acceso} } }); })()`);
  await pref(false);
  await aspetta(1);
  controlla('spenta sparisce subito (niente canvas)', (await u(`${canvasFissi}.length`)) === 0);
  await pref(true);
  await aspetta(1);
  controlla('riaccesa torna', !!(await u('cutxCimice().acceso')));
  await js('cutxProva.fermaTutto()');
  return ok;
}
